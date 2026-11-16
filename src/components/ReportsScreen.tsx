/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reports Catalog Screen (`ReportsScreen`).
 *
 * Displays the planned per-species catalog of inventory, breeding, health, income,
 * ownership, and calendar reports strictly for species added to the user's barn.
 * Report entries are stylized preview placeholders only — actual report generation
 * and links are not yet active.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Baby,
  CalendarDays,
  ClipboardList,
  DollarSign,
  FileSpreadsheet,
  HeartPulse,
  Scale,
  Settings,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Tag,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SpeciesProfile } from '../core/models';
import { buildReportCatalogForSpecies, ReportIconKey } from '../core/reportCatalog';

const REPORT_ICON_MAP: Record<ReportIconKey, LucideIcon> = {
  calendar: CalendarDays,
  roster: ClipboardList,
  tag: Tag,
  income: DollarSign,
  weight: Scale,
  breeding: Sparkles,
  medicine: Stethoscope,
  health: HeartPulse,
  ultrasound: FileSpreadsheet,
  alert: ShieldAlert,
  offspring: Baby,
  users: Users,
  ownership: Settings,
};

interface ReportsScreenProps {
  activeSpeciesName: string;
  speciesProfiles: SpeciesProfile[];
}

export function ReportsScreen({ activeSpeciesName, speciesProfiles }: ReportsScreenProps) {
  const [selectedSpeciesName, setSelectedSpeciesName] = useState<string>(activeSpeciesName);

  useEffect(() => {
    const matchesActive = speciesProfiles.some((sp) => sp.name === activeSpeciesName);
    if (matchesActive) {
      setSelectedSpeciesName(activeSpeciesName);
    } else if (speciesProfiles.length > 0) {
      setSelectedSpeciesName((prev) =>
        speciesProfiles.some((sp) => sp.name === prev) ? prev : speciesProfiles[0].name
      );
    }
  }, [activeSpeciesName, speciesProfiles]);

  const selectedSpeciesProfile = useMemo(() => {
    if (speciesProfiles.length === 0) return null;
    return (
      speciesProfiles.find((sp) => sp.name === selectedSpeciesName) ||
      speciesProfiles.find((sp) => sp.name === activeSpeciesName) ||
      speciesProfiles[0]
    );
  }, [speciesProfiles, selectedSpeciesName, activeSpeciesName]);

  const catalogEntries = useMemo(() => {
    if (!selectedSpeciesProfile) return [];
    return buildReportCatalogForSpecies(selectedSpeciesProfile);
  }, [selectedSpeciesProfile]);

  return (
    <div className="space-y-5">
      {/* Work-In-Progress Notice Near Top */}
      <div
        role="note"
        className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/75 text-xs text-[var(--barn-ink)]"
      >
        <AlertTriangle
          className="w-4 h-4 text-[var(--barn-terracotta)] mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="space-y-0.5">
          <p className="font-semibold">This feature isn&rsquo;t working yet</p>
          <p className="text-[var(--barn-muted)]">
            These report entries are a preview of your per-species reports directory. Individual
            report links and generators are disabled while this section is still under construction.
          </p>
        </div>
      </div>

      {/* Screen Header */}
      <header className="space-y-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
            Reports
          </h1>
          <p className="text-xs sm:text-sm text-[var(--barn-muted)]">
            {selectedSpeciesProfile ? (
              <>
                Per-species directory for{' '}
                <span className="font-semibold text-[var(--barn-ink)]">
                  {selectedSpeciesProfile.name}
                </span>{' '}
                &middot;{' '}
                <span className="font-mono tabular-nums">{catalogEntries.length}</span> planned
                report templates &middot; Links disabled until release
              </>
            ) : (
              <>No species added yet &middot; Add a species in Settings to view its reports</>
            )}
          </p>
        </div>

        {/* Added Species Switcher (strictly displays only species added to this barn) */}
        {speciesProfiles.length > 0 && (
          <div
            aria-label="Added Species Reports Filter"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-xs font-medium text-[var(--barn-muted)] mr-1">
              Added species:
            </span>
            {speciesProfiles.map((sp) => {
              const isSelected = selectedSpeciesProfile?.name === sp.name;
              return (
                <button
                  key={sp.id}
                  type="button"
                  onClick={() => setSelectedSpeciesName(sp.name)}
                  aria-pressed={isSelected}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                    isSelected
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-[var(--barn-sage)]'
                      : 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-canvas)]'
                  }`}
                >
                  {sp.name}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Stylized Non-Interactive Report Entries Ledger */}
      {selectedSpeciesProfile ? (
        <section
          aria-label={`${selectedSpeciesProfile.name} Planned Reports Directory`}
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden"
        >
          <div className="px-4 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/60 flex items-center justify-between gap-4 text-[11px] font-semibold text-[var(--barn-muted)]">
            <span>Report Name ({selectedSpeciesProfile.name})</span>
            <span className="hidden md:inline">Scope &amp; Category</span>
          </div>

          <ul className="divide-y divide-[var(--barn-border)]/70">
            {catalogEntries.map((entry, idx) => {
              const Icon = REPORT_ICON_MAP[entry.iconKey] || ClipboardList;
              return (
                <li
                  key={entry.id}
                  className={`px-4 py-3 flex items-center justify-between gap-4 ${
                    idx % 2 === 0 ? 'bg-[var(--barn-surface)]' : 'bg-[var(--barn-canvas)]/45'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <span
                      className="w-8 h-8 rounded-lg border border-[var(--barn-border)]/80 bg-[var(--barn-subtle)]/60 text-[var(--barn-slate)] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0"
                      aria-hidden="true"
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[var(--barn-ink)] truncate">
                        {entry.title}
                      </div>
                      <div className="text-xs text-[var(--barn-muted)] truncate">
                        {entry.description}
                      </div>
                    </div>
                  </div>

                  <div className="hidden md:flex items-center gap-3 shrink-0 text-xs text-[var(--barn-muted)]">
                    <span className="font-medium text-[var(--barn-slate)]">{entry.scopeLabel}</span>
                    <span aria-hidden="true">&middot;</span>
                    <span>{entry.category}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 text-center text-sm text-[var(--barn-muted)]">
          No species have been added yet. Add a species in Settings to preview its per-species
          report directory.
        </section>
      )}
    </div>
  );
}
