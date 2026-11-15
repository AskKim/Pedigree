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
  BarnDatabaseSnapshot,
  BreedingRecord,
  isAnimalArchived,
  isSameSpecies,
  SpeciesProfile,
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
  onClearTaskAlertGroup: (speciesName: string, taskIds: string[]) => void;
  onNavigateToAddSpecies: () => void;
}

function diffIsoDays(targetIso: string, baseIso: string): number | null {
  if (!targetIso || !baseIso) return null;
  const t = Date.parse(`${targetIso}T00:00:00Z`);
  const b = Date.parse(`${baseIso}T00:00:00Z`);
  if (Number.isNaN(t) || Number.isNaN(b)) return null;
  return Math.round((t - b) / 86400000);
}

function isBirthNearlyDue(b: BreedingRecord, sp: SpeciesProfile, todayIso: string): boolean {
  if (!['Planned', 'Bred', 'Palpated Positive'].includes(b.status)) return false;
  if (b.actualBirthDateIso || !b.expectedDueDateIso) return false;
  const daysUntil = diffIsoDays(b.expectedDueDateIso, todayIso);
  if (daysUntil === null || daysUntil < -7) return false;
  const gestationDays = Math.max(1, sp.gestationDays || 30);
  const progressRatio = (gestationDays - daysUntil) / gestationDays;
  return daysUntil <= 5 || progressRatio >= 0.85;
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

  const activeGestations = snapshot.breedings.filter((b) =>
    ['Planned', 'Bred', 'Palpated Positive'].includes(b.status)
  ).length;
  const openTasks = snapshot.tasks.filter(
    (t) => !t.completed && (!t.linkedAnimalId || !archivedIdSet.has(t.linkedAnimalId))
  ).length;

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
        <div className="space-y-1 max-w-2xl">
          <p className="text-xs text-[var(--barn-muted)]">
            100% Free Offline PWA · Full Local Data Ownership
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
            {snapshot.settings.barnName || 'My Barn'}
          </h1>
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
            const dueTasks = snapshot.tasks.filter(
              (t) =>
                isSameSpecies(t.species, sp.name) &&
                !t.completed &&
                Boolean(t.dueDateIso) &&
                t.dueDateIso <= today &&
                !ignoredTaskIdSet.has(t.id) &&
                (!t.linkedAnimalId || !archivedIdSet.has(t.linkedAnimalId))
            );
            const dueTaskIds = dueTasks.map((t) => t.id).sort();
            const dismissedGroup = new Set(
              snapshot.settings.dismissedTaskGroupKeys?.[spKey] || []
            );
            const showDueTaskAlert =
              dueTaskIds.length > 0 && dueTaskIds.some((id) => !dismissedGroup.has(id));

            const upcomingBirths = snapshot.breedings.filter(
              (b) => isSameSpecies(b.species, sp.name) && isBirthNearlyDue(b, sp, today)
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
                  {/* Card Header: Drag Grip + Name + Position + Reorder Arrows */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        title="Drag card to reorder"
                        className="text-[var(--barn-muted)] cursor-grab active:cursor-grabbing hidden sm:inline-flex shrink-0"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <h3 className="font-display text-lg font-semibold leading-snug truncate">
                        {sp.name}
                      </h3>
                      <span className="text-[11px] font-mono text-[var(--barn-muted)] tabular-nums shrink-0">
                        #{index + 1}
                      </span>
                    </div>

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

                  {/* Babies About to Arrive Alert (gestation nearly complete) */}
                  {upcomingBirths.length > 0 && (
                    <div className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)] space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <Baby
                            className="w-4 h-4 text-[var(--barn-sage)] mt-0.5 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-[var(--barn-ink)]">
                              {upcomingBirths.length}{' '}
                              {upcomingBirths.length === 1
                                ? `${sp.birthEventLabel} Soon`
                                : `${sp.birthEventLabel}s Soon`}
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate">
                              {upcomingBirths
                                .slice(0, 2)
                                .map((b) => {
                                  const d = diffIsoDays(b.expectedDueDateIso, today);
                                  const dueTag =
                                    d === 0
                                      ? 'due today'
                                      : d && d < 0
                                      ? `${Math.abs(d)}d overdue`
                                      : `in ${d}d`;
                                  return `${b.damName} (${dueTag})`;
                                })
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
                              .map((t) => t.title)
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
                          onClick={() => onClearTaskAlertGroup(sp.name, dueTaskIds)}
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

                <button
                  type="button"
                  onClick={() => onOpenSpecies(sp.name, 'dashboard')}
                  className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  Open {sp.name} Hub
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
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
