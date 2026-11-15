/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Multi-Species Barn Home Landing Screen (`Home`).
 *
 * Displays barn-wide metrics across all configured livestock species, lets breeders
 * add custom livestock species, reorder species preview cards (via Up/Down/Move-to-Top arrows
 * on touch devices or drag-and-drop on desktop), pin any species as their startup landing page,
 * and open any species' dedicated, strictly isolated workspace.
 */

import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  GripVertical,
  Pin,
  Plus,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  BarnDatabaseSnapshot,
  isSameSpecies,
  SpeciesProfile,
  todayDateIso,
} from '../core/models';
import {
  countAllSpeciesRecords,
  countSpeciesTestingRecords,
} from '../core/sampleData';
import { WorkspaceRoute } from '../hooks/useBarnStore';
import { SpeciesEditorModal } from './SpeciesEditorModal';

interface HomeSpeciesScreenProps {
  snapshot: BarnDatabaseSnapshot;
  onOpenSpecies: (speciesName: string, route?: WorkspaceRoute) => void;
  onTogglePinSpecies: (speciesName: string) => void;
  onSaveSpecies: (profile: SpeciesProfile) => void;
  onMoveSpeciesCard: (speciesId: string, direction: 'up' | 'down' | 'top') => void;
  onReorderSpeciesCards: (orderedIds: string[]) => void;
  onDeleteSpecies: (profile: SpeciesProfile) => void;
  onSeedSpeciesSample: (speciesName: string) => void;
  onDeleteSpeciesTestingData: (speciesName: string) => void;
  onDeleteAllSpeciesRecords: (speciesName: string) => void;
  onOpenSettings: () => void;
}

export function HomeSpeciesScreen({
  snapshot,
  onOpenSpecies,
  onTogglePinSpecies,
  onSaveSpecies,
  onMoveSpeciesCard,
  onReorderSpeciesCards,
  onDeleteSpecies,
  onSeedSpeciesSample,
  onDeleteSpeciesTestingData,
  onDeleteAllSpeciesRecords,
  onOpenSettings,
}: HomeSpeciesScreenProps) {
  const [editingSpecies, setEditingSpecies] = useState<SpeciesProfile | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [draggedSpeciesId, setDraggedSpeciesId] = useState<string | null>(null);
  const [dragOverSpeciesId, setDragOverSpeciesId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    speciesName: string;
    mode: 'testing' | 'all';
  } | null>(null);

  const today = todayDateIso();
  const totalAnimals = snapshot.animals.length;
  const activeGestations = snapshot.breedings.filter((b) =>
    ['Planned', 'Bred', 'Palpated Positive'].includes(b.status)
  ).length;
  const openTasks = snapshot.tasks.filter((t) => !t.completed).length;
  const upcomingShows = snapshot.shows.filter((s) => s.eventDateIso >= today).length;

  const pinnedName = snapshot.settings.pinnedLandingSpecies;

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
    <div className="space-y-8">
      {/* Barn Hero Header + Full-Width KPI Strip */}
      <section className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <p className="text-xs text-[var(--barn-muted)]">
              Offline-First Livestock &amp; Pedigree Registry · Local Unencrypted SQLite
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-balance">
              {snapshot.settings.barnName || 'My Barn'}
            </h1>
            <p className="text-sm text-[var(--barn-muted)]">
              Select any livestock species below to open its isolated herd ledger, cage-side
              breeding logger, and recursive pedigree explorer—or arrange your favorite species to
              the top of your barn.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium hover:bg-[var(--barn-subtle)] transition-colors whitespace-nowrap"
            >
              Import (HerdBoss) &amp; Settings
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingSpecies(null);
                setShowEditor(true);
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add Custom Livestock
            </button>
          </div>
        </div>

        {/* 4-Column Barn-Wide KPI Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4">
            <div className="text-xs text-[var(--barn-muted)]">Total Barn Headcount</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{totalAnimals}</div>
            <div className="mt-1 text-xs text-[var(--barn-muted)]">
              Across {snapshot.speciesProfiles.length} configured species
            </div>
          </div>
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4">
            <div className="text-xs text-[var(--barn-muted)]">Active Gestations</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
              {activeGestations}
            </div>
            <div className="mt-1 text-xs text-[var(--barn-muted)]">
              Planned, bred, or confirmed
            </div>
          </div>
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4">
            <div className="text-xs text-[var(--barn-muted)]">Open Barn Chores</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{openTasks}</div>
            <div className="mt-1 text-xs text-[var(--barn-muted)]">
              TaskMaster &amp; manual reminders
            </div>
          </div>
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4">
            <div className="text-xs text-[var(--barn-muted)]">Startup Landing Mode</div>
            <div className="mt-1 text-lg font-semibold truncate">
              {pinnedName ? `${pinnedName} Hub` : 'All-Species Home'}
            </div>
            <div className="mt-1 text-xs text-[var(--barn-muted)]">
              {upcomingShows} upcoming show{upcomingShows === 1 ? '' : 's'} scheduled
            </div>
          </div>
        </div>
      </section>

      {/* Reorderable Species Hub Cards Grid */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">
            Configured Livestock Species ({snapshot.speciesProfiles.length})
          </h2>
          <span className="text-xs text-[var(--barn-muted)]">
            Use ↑ ↓ / ⤒ arrows (or drag cards) to sort · Pin any species to open on launch
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {snapshot.speciesProfiles.map((sp, index) => {
            const count = snapshot.animals.filter((a) => isSameSpecies(a.species, sp.name)).length;
            const spDue = snapshot.breedings.filter(
              (b) =>
                isSameSpecies(b.species, sp.name) &&
                ['Planned', 'Bred', 'Palpated Positive'].includes(b.status)
            ).length;
            const spTasks = snapshot.tasks.filter(
              (t) => isSameSpecies(t.species, sp.name) && !t.completed
            ).length;
            const spTestingRecords = countSpeciesTestingRecords(snapshot, sp.name);
            const spTotalRecords = countAllSpeciesRecords(snapshot, sp.name);
            const activeConfirmMode =
              confirmAction && isSameSpecies(confirmAction.speciesName, sp.name)
                ? confirmAction.mode
                : null;
            const isPinned = isSameSpecies(pinnedName, sp.name);
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
                className={`bg-[var(--barn-surface)] border rounded-2xl p-5 flex flex-col justify-between gap-5 transition-colors ${
                  isDragTarget
                    ? 'border-[var(--barn-sage)] ring-2 ring-[var(--barn-sage)]/40'
                    : 'border-[var(--barn-border)]'
                }`}
              >
                <div className="space-y-3">
                  {/* Card Top Bar: Drag Grip + Title + Reorder Arrows + Pin + Edit */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span
                        title="Drag card to reorder"
                        className="mt-1 text-[var(--barn-muted)] cursor-grab active:cursor-grabbing hidden sm:inline-flex shrink-0"
                        aria-hidden="true"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-lg font-semibold leading-snug truncate">
                            {sp.name}
                          </h3>
                          <span className="text-[11px] font-mono text-[var(--barn-muted)] shrink-0">
                            #{index + 1}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--barn-muted)] mt-0.5 truncate">
                          {sp.maleLabel} · {sp.femaleLabel} · {sp.offspringLabel} ·{' '}
                          {sp.birthEventLabel}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Reorder Controls: Move to Top, Move Up, Move Down */}
                      <div
                        role="group"
                        aria-label={`Reorder ${sp.name} card`}
                        className="inline-flex items-center rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-0.5"
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

                      <button
                        type="button"
                        onClick={() => onTogglePinSpecies(sp.name)}
                        title={
                          isPinned
                            ? `Unpin ${sp.name} from startup landing`
                            : `Pin ${sp.name} as startup landing page`
                        }
                        className={`min-h-[36px] px-2.5 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                          isPinned
                            ? 'bg-[var(--barn-accent-fill)] text-[var(--barn-accent-on-fill)] border-transparent'
                            : 'border-[var(--barn-border)] text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)]'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                        {isPinned ? 'Pinned' : 'Pin'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingSpecies(sp);
                          setShowEditor(true);
                        }}
                        aria-label={`Edit ${sp.name} biological schedule`}
                        title={`Edit ${sp.name} schedule & milestone dates`}
                        className="min-h-[36px] min-w-[36px] rounded-lg border border-[var(--barn-border)] text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)] flex items-center justify-center transition-colors"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs text-[var(--barn-muted)] font-mono tabular-nums">
                    {count} {count === 1 ? 'animal' : 'animals'} · {spDue} active gestation
                    {spDue === 1 ? '' : 's'} · {spTasks} open chore{spTasks === 1 ? '' : 's'}
                  </div>

                  <div className="border-t border-b border-[var(--barn-border)] py-2.5 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-[var(--barn-muted)]">Gestation</div>
                      <div className="font-mono font-medium tabular-nums mt-0.5">
                        {sp.gestationDays}d
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--barn-muted)]">Weaning</div>
                      <div className="font-mono font-medium tabular-nums mt-0.5">
                        +{sp.weanDaysAfterBirth}d
                      </div>
                    </div>
                    <div>
                      <div className="text-[var(--barn-muted)]">Rebreed</div>
                      <div className="font-mono font-medium tabular-nums mt-0.5">
                        +{sp.rebreedDaysAfterBirth}d
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-[var(--barn-muted)] line-clamp-2">
                    Care rules:{' '}
                    {sp.milestones.length > 0
                      ? sp.milestones.map((m) => m.label).join(' · ')
                      : 'None configured'}
                  </div>
                </div>

                <div className="space-y-2.5">
                  {/* Per-Species Delete Testing Data & Delete All Records Controls */}
                  {(spTestingRecords > 0 || spTotalRecords > 0) && (
                    <div className="pt-2 border-t border-[var(--barn-border)]">
                      {activeConfirmMode ? (
                        <div className="p-2.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-danger)]/50 space-y-2 text-xs">
                          <div className="text-[11px] font-medium text-[var(--barn-ink)]">
                            {activeConfirmMode === 'testing'
                              ? `Delete ${spTestingRecords} sample/testing records in ${sp.name}? Real/imported ${sp.name} records stay safe.`
                              : `Delete ALL ${spTotalRecords} records in ${sp.name}? Other species are untouched.`}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (activeConfirmMode === 'testing') {
                                  onDeleteSpeciesTestingData(sp.name);
                                } else {
                                  onDeleteAllSpeciesRecords(sp.name);
                                }
                                setConfirmAction(null);
                              }}
                              className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-danger)] text-white text-[11px] font-semibold whitespace-nowrap"
                            >
                              {activeConfirmMode === 'testing'
                                ? `Confirm Delete Testing Data`
                                : `Confirm Delete All ${sp.name} Records`}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmAction(null)}
                              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {spTestingRecords > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({ speciesName: sp.name, mode: 'testing' })
                              }
                              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium text-[var(--barn-muted)] hover:text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                              Delete Testing Data
                            </button>
                          )}
                          {spTotalRecords > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmAction({ speciesName: sp.name, mode: 'all' })
                              }
                              className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] text-[11px] font-medium text-[var(--barn-danger)] hover:bg-[var(--barn-subtle)] inline-flex items-center gap-1 whitespace-nowrap"
                            >
                              <Trash2 className="w-3 h-3" aria-hidden="true" />
                              Delete All {sp.name} Records
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenSpecies(sp.name, 'herd')}
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs font-medium hover:bg-[var(--barn-subtle)] transition-colors whitespace-nowrap"
                      >
                        Herd ({count})
                      </button>
                      {count === 0 && (
                        <button
                          type="button"
                          onClick={() => onSeedSpeciesSample(sp.name)}
                          className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-[var(--barn-border)] text-xs text-[var(--barn-muted)] hover:bg-[var(--barn-subtle)] whitespace-nowrap"
                        >
                          Load Sample
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onOpenSpecies(sp.name, 'dashboard')}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      Open {sp.name} Hub
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {showEditor && (
        <SpeciesEditorModal
          initialProfile={editingSpecies}
          existingNames={snapshot.speciesProfiles.map((p) => p.name)}
          onSave={onSaveSpecies}
          onDelete={onDeleteSpecies}
          onClose={() => setShowEditor(false)}
        />
      )}
    </div>
  );
}
