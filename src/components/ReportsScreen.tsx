/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Interactive Per-Species Reports Screen (`ReportsScreen`).
 *
 * Strictly scoped to livestock species added in `snapshot.speciesProfiles`.
 * Supports live catalog search, category & audience filtering (`All`, `Male`,
 * `Female`, `Non-Adult Male`, `Non-Adult Female`), optional date windows,
 * interactive tabular previews, animal deep-links, UTF-8 CSV download, and
 * white-paper PDF printing via `PrintPreviewModal`.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Baby,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Download,
  FileSpreadsheet,
  HeartPulse,
  Printer,
  RotateCcw,
  Scale,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Tag,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  BarnDatabaseSnapshot,
  isAnimalActive,
  isSameSpecies,
  SpeciesProfile,
} from '../core/models';
import { buildReportCatalogForSpecies, ReportIconKey } from '../core/reportCatalog';
import {
  buildPrintableReportHtml,
  buildReportFileName,
  exportReportToCsv,
  generateSpeciesReport,
  REPORT_AUDIENCE_FILTERS,
  ReportAudienceFilter,
} from '../core/reportGenerators';
import { useVirtualWindow } from '../utils/useVirtualWindow';
import { downloadTextFile } from '../utils/webFileActions';
import { PrintPreviewModal } from './PrintPreviewModal';

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
  snapshot: BarnDatabaseSnapshot;
  activeSpeciesName: string;
  speciesProfiles: SpeciesProfile[];
  onSelectSpecies?: (speciesName: string) => void;
  onOpenAnimal?: (animalId: string) => void;
}

export function ReportsScreen({
  snapshot,
  activeSpeciesName,
  speciesProfiles,
  onSelectSpecies,
  onOpenAnimal,
}: ReportsScreenProps) {
  const [selectedSpeciesName, setSelectedSpeciesName] = useState<string>(activeSpeciesName);
  const [selectedReportId, setSelectedReportId] = useState<string>('roster-report');
  const [mobileView, setMobileView] = useState<'catalog' | 'preview'>('catalog');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [audienceFilter, setAudienceFilter] = useState<ReportAudienceFilter>('All');
  const [dateFromIso, setDateFromIso] = useState<string>('');
  const [dateToIso, setDateToIso] = useState<string>('');
  const [subjectAnimalId, setSubjectAnimalId] = useState<string>('');
  const [tableSearch, setTableSearch] = useState<string>('');
  const [printPreview, setPrintPreview] = useState<{
    title: string;
    filename: string;
    html: string;
  } | null>(null);

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

  // Clear animal-specific focus when switching species
  useEffect(() => {
    setSubjectAnimalId('');
    setTableSearch('');
  }, [selectedSpeciesName]);

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

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const entry of catalogEntries) {
      set.add(entry.category);
    }
    return ['All', ...Array.from(set)];
  }, [catalogEntries]);

  const filteredCatalogEntries = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalogEntries.filter((entry) => {
      if (selectedCategory !== 'All' && entry.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        entry.title.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q)
      );
    });
  }, [catalogEntries, catalogSearch, selectedCategory]);

  // Ensure selectedReportId remains valid when switching species
  useEffect(() => {
    if (catalogEntries.length === 0) return;
    if (!catalogEntries.some((e) => e.id === selectedReportId)) {
      setSelectedReportId(catalogEntries[0].id);
    }
  }, [catalogEntries, selectedReportId]);

  const eligibleBreedWithSubjects = useMemo(() => {
    if (!selectedSpeciesProfile) return [];
    return snapshot.animals
      .filter(
        (a) =>
          isSameSpecies(a.species, selectedSpeciesProfile.name) &&
          isAnimalActive(a) &&
          !a.culled &&
          (a.sex === 'Male' || a.sex === 'Female')
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [snapshot.animals, selectedSpeciesProfile]);

  const activeReport = useMemo(() => {
    if (!selectedSpeciesProfile) return null;
    return generateSpeciesReport(snapshot, selectedSpeciesProfile.name, selectedReportId, {
      filter: audienceFilter,
      dateFromIso: dateFromIso || undefined,
      dateToIso: dateToIso || undefined,
      subjectAnimalId: selectedReportId === 'breed-with-report' ? subjectAnimalId || undefined : undefined,
    });
  }, [
    snapshot,
    selectedSpeciesProfile,
    selectedReportId,
    audienceFilter,
    dateFromIso,
    dateToIso,
    subjectAnimalId,
  ]);

  const displayedRows = useMemo(() => {
    if (!activeReport) return [];
    const q = tableSearch.trim().toLowerCase();
    if (!q) return activeReport.rows;
    return activeReport.rows.filter((row) =>
      activeReport.columns.some((col) =>
        String(row.cells[col.key] ?? '')
          .toLowerCase()
          .includes(q)
      )
    );
  }, [activeReport, tableSearch]);

  const reportVirtual = useVirtualWindow({
    itemCount: displayedRows.length,
    estimateSize: 44,
    overscan: 10,
    initialFallbackCount: 40,
    resetKey: `${selectedSpeciesName}::${selectedReportId}::${tableSearch}::${dateFromIso}::${dateToIso}::${audienceFilter}::${subjectAnimalId}`,
  });

  const windowedRows = useMemo(
    () =>
      displayedRows.length > 0 &&
      reportVirtual.windowRange.endIndex >= reportVirtual.windowRange.startIndex
        ? displayedRows.slice(
            reportVirtual.windowRange.startIndex,
            reportVirtual.windowRange.endIndex + 1
          )
        : [],
    [
      displayedRows,
      reportVirtual.windowRange.startIndex,
      reportVirtual.windowRange.endIndex,
    ]
  );

  const reportTableColCount =
    (activeReport?.columns.length ?? 0) + (onOpenAnimal ? 1 : 0);

  const handleSelectSpecies = (name: string) => {
    setSelectedSpeciesName(name);
    onSelectSpecies?.(name);
  };

  const handleSelectReport = (reportId: string) => {
    setSelectedReportId(reportId);
    setTableSearch('');
    setMobileView('preview');
  };

  const handleDownloadCsv = async () => {
    if (!activeReport) return;
    const reportForExport =
      tableSearch.trim() && displayedRows.length !== activeReport.rows.length
        ? { ...activeReport, rows: displayedRows }
        : activeReport;
    const csv = exportReportToCsv(reportForExport);
    const filename = buildReportFileName(reportForExport, 'csv', snapshot.settings.barnName);
    try {
      await downloadTextFile(filename, csv, 'text/csv');
    } catch {
      // Error surfaced cleanly without unhandled rejection
    }
  };

  const handleOpenPrintPreview = () => {
    if (!activeReport) return;
    const reportForPrint =
      tableSearch.trim() && displayedRows.length !== activeReport.rows.length
        ? { ...activeReport, rows: displayedRows }
        : activeReport;
    const html = buildPrintableReportHtml(reportForPrint, snapshot.settings);
    const filename = buildReportFileName(reportForPrint, 'htm', snapshot.settings.barnName);
    setPrintPreview({
      title: `${reportForPrint.speciesName} — ${reportForPrint.title}`,
      filename,
      html,
    });
  };

  const isInvertedDateRange = Boolean(
    dateFromIso && dateToIso && dateFromIso > dateToIso
  );

  const hasActiveFilters =
    audienceFilter !== 'All' ||
    Boolean(dateFromIso) ||
    Boolean(dateToIso) ||
    Boolean(tableSearch.trim()) ||
    Boolean(subjectAnimalId);

  const handleResetFilters = () => {
    setAudienceFilter('All');
    setDateFromIso('');
    setDateToIso('');
    setSubjectAnimalId('');
    setTableSearch('');
  };

  const handleSwapDates = () => {
    setDateFromIso(dateToIso);
    setDateToIso(dateFromIso);
  };

  return (
    <div className="space-y-4">
      {/* Screen Header & Added Species Switcher */}
      <header className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-balance">
              Reports
            </h1>
            <p className="text-xs sm:text-sm text-[var(--barn-muted)]">
              {selectedSpeciesProfile ? (
                <>
                  <span>{selectedSpeciesProfile.name} Only</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span className="font-mono tabular-nums">{catalogEntries.length}</span>{' '}
                  <span>reports</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span>Unit: {activeReport?.weightUnit || 'lbs_oz'}</span>
                </>
              ) : (
                <>No species added yet &middot; Add a species in Settings to run reports</>
              )}
            </p>
          </div>

          {speciesProfiles.length > 0 && (
            <div
              aria-label="Added Species Reports Filter"
              className="flex flex-wrap items-center gap-1.5"
            >
              {speciesProfiles.map((sp) => {
                const isSelected = selectedSpeciesProfile?.name === sp.name;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => handleSelectSpecies(sp.name)}
                    aria-pressed={isSelected}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)] border-[var(--barn-sage)]'
                        : 'bg-[var(--barn-surface)] text-[var(--barn-ink)] border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {sp.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Global Audience, Category & Date Range Filter Strip */}
        {selectedSpeciesProfile && (
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-3 flex flex-wrap items-end gap-2.5">
            <div className="flex-1 min-w-[180px]">
              <label
                htmlFor="report-audience-filter"
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                Sex &amp; Age Filter
              </label>
              <select
                id="report-audience-filter"
                value={audienceFilter}
                onChange={(e) => setAudienceFilter(e.target.value as ReportAudienceFilter)}
                className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                {REPORT_AUDIENCE_FILTERS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[150px]">
              <label
                htmlFor="report-category-filter"
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                Category
              </label>
              <select
                id="report-category-filter"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[140px]">
              <label
                htmlFor="report-date-from"
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                From Date
              </label>
              <input
                id="report-date-from"
                type="date"
                value={dateFromIso}
                onChange={(e) => setDateFromIso(e.target.value)}
                className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
              />
            </div>

            <div className="min-w-[140px]">
              <label
                htmlFor="report-date-to"
                className="block text-[11px] font-medium text-[var(--barn-muted)] mb-1"
              >
                To Date
              </label>
              <input
                id="report-date-to"
                type="date"
                value={dateToIso}
                onChange={(e) => setDateToIso(e.target.value)}
                className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-mono"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        )}

        {isInvertedDateRange && (
          <div
            role="status"
            className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              <strong>From Date</strong> (<span className="font-mono">{dateFromIso}</span>) is after{' '}
              <strong>To Date</strong> (<span className="font-mono">{dateToIso}</span>), so no dated
              records can match.
            </span>
            <div className="flex flex-wrap items-center gap-2 max-w-full">
              <button
                type="button"
                onClick={handleSwapDates}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-semibold hover:bg-[var(--barn-subtle)]"
              >
                Swap Dates
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateFromIso('');
                  setDateToIso('');
                }}
                className="min-h-[32px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Split Workspace (Desktop) / Switchable Catalog <-> Preview (Mobile) */}
      {selectedSpeciesProfile && activeReport ? (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 items-start">
          {/* Left Column: Searchable Report Directory */}
          <section
            aria-label={`${selectedSpeciesProfile.name} Reports Directory`}
            className={`${
              mobileView === 'preview' ? 'hidden lg:block' : 'block'
            } bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden`}
          >
            <div className="p-3 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/50">
              <div className="relative">
                <Search
                  className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder={`Filter ${selectedSpeciesProfile.name} reports...`}
                  aria-label="Filter report templates"
                  className="w-full min-h-[38px] pl-8 pr-3 py-1.5 rounded-xl bg-[var(--barn-surface)] border border-[var(--barn-border)] text-xs placeholder:text-[var(--barn-muted)]"
                />
              </div>
            </div>

            {filteredCatalogEntries.length > 0 ? (
              <ul className="divide-y divide-[var(--barn-border)]/70 lg:max-h-[68vh] lg:overflow-y-auto">
                {filteredCatalogEntries.map((entry) => {
                  const Icon = REPORT_ICON_MAP[entry.iconKey] || ClipboardList;
                  const isActive = entry.id === selectedReportId;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectReport(entry.id)}
                        aria-current={isActive ? 'true' : undefined}
                        className={`w-full text-left px-3.5 py-3 flex items-center justify-between gap-3 transition-colors ${
                          isActive
                            ? 'bg-[var(--barn-sage-tint)] text-[var(--barn-ink)]'
                            : 'hover:bg-[var(--barn-canvas)]/70'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <span
                            className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${
                              isActive
                                ? 'border-[var(--barn-sage)] bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                                : 'border-[var(--barn-border)]/80 bg-[var(--barn-canvas)] text-[var(--barn-slate)]'
                            }`}
                            aria-hidden="true"
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs sm:text-sm font-semibold text-[var(--barn-ink)] truncate">
                              {entry.title}
                            </div>
                            <div className="text-[11px] text-[var(--barn-muted)] truncate">
                              {entry.category} &middot; {entry.description}
                            </div>
                          </div>
                        </div>
                        <ChevronRight
                          className={`w-4 h-4 shrink-0 ${
                            isActive ? 'text-[var(--barn-sage)]' : 'text-[var(--barn-muted)]'
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-6 text-center text-xs text-[var(--barn-muted)] space-y-2">
                <p>No report templates matched &ldquo;{catalogSearch}&rdquo;.</p>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogSearch('');
                    setSelectedCategory('All');
                  }}
                  className="text-xs font-medium underline text-[var(--barn-ink)]"
                >
                  Show all {catalogEntries.length} reports
                </button>
              </div>
            )}
          </section>

          {/* Right Column: Live Report Table & Export Toolbar */}
          <section
            aria-label={`${activeReport.title} Preview`}
            className={`${
              mobileView === 'catalog' ? 'hidden lg:block' : 'block'
            } bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-hidden min-w-0`}
          >
            {/* Mobile Back-to-Catalog Bar */}
            <div className="lg:hidden px-3.5 py-2.5 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/70 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setMobileView('catalog')}
                className="min-h-[36px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                All {selectedSpeciesProfile.name} Reports
              </button>
              <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)]">
                {displayedRows.length} rows
              </span>
            </div>

            {/* Active Report Header + Export Controls */}
            <div className="p-4 border-b border-[var(--barn-border)] flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] text-[var(--barn-muted)]">
                  <span>{activeReport.speciesName} Only</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span>{activeReport.category}</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span>Filter: {activeReport.audienceFilter}</span>
                  <span aria-hidden="true"> &middot; </span>
                  <span className="font-mono tabular-nums">
                    {displayedRows.length} row{displayedRows.length === 1 ? '' : 's'}
                  </span>
                </div>
                <h2 className="font-display text-lg sm:text-xl font-semibold text-[var(--barn-ink)] text-balance">
                  {activeReport.title}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">{activeReport.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 max-w-full">
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="min-h-[40px] max-w-full px-3.5 py-2 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Download CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenPrintPreview}
                  className="min-h-[40px] max-w-full px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] hover:opacity-95 text-xs font-semibold inline-flex items-center gap-1.5 transition-opacity"
                >
                  <Printer className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Print / Save PDF</span>
                </button>
              </div>
            </div>

            {/* Inline Summary Metrics Strip (Flat Hairline Dividers, Zero Nested Cards) */}
            {activeReport.summaryMetrics.length > 0 && (
              <div className="px-4 py-3 border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/45 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-x-6 gap-y-2">
                {activeReport.summaryMetrics.map((metric) => (
                  <div key={metric.label} className="min-w-0">
                    <div className="text-[11px] text-[var(--barn-muted)] truncate">
                      {metric.label}
                    </div>
                    <div
                      className={`text-sm sm:text-base font-semibold font-mono tabular-nums ${
                        metric.tone === 'danger'
                          ? 'text-red-700 dark:text-red-400'
                          : metric.tone === 'warning'
                          ? 'text-[var(--barn-terracotta)]'
                          : metric.tone === 'positive'
                          ? 'text-[var(--barn-sage)]'
                          : 'text-[var(--barn-ink)]'
                      }`}
                    >
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Report-Specific Controls (Breed With Subject Focus + In-Table Search) */}
            {(activeReport.reportId === 'breed-with-report' || activeReport.rows.length > 0) && (
              <div className="px-4 py-2.5 border-b border-[var(--barn-border)] flex flex-wrap items-center justify-between gap-2.5">
                {activeReport.reportId === 'breed-with-report' ? (
                  <div className="flex items-center gap-2 min-w-[220px] flex-1 max-w-sm">
                    <label
                      htmlFor="breed-with-subject"
                      className="text-xs text-[var(--barn-muted)] whitespace-nowrap"
                    >
                      Focus Animal:
                    </label>
                    <select
                      id="breed-with-subject"
                      value={subjectAnimalId}
                      onChange={(e) => setSubjectAnimalId(e.target.value)}
                      className="flex-1 min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                    >
                      <option value="">All Active Males &times; Females</option>
                      {eligibleBreedWithSubjects.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.tattoo ? ` (${a.tattoo})` : ''} &middot; {a.sex}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="text-[11px] text-[var(--barn-muted)]">
                    Showing{' '}
                    <span className="font-mono tabular-nums font-medium text-[var(--barn-ink)]">
                      {displayedRows.length}
                    </span>{' '}
                    of{' '}
                    <span className="font-mono tabular-nums">{activeReport.rows.length}</span>{' '}
                    entries
                  </span>
                )}

                {activeReport.rows.length > 0 && (
                  <div className="relative w-full sm:w-64">
                    <Search
                      className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search rows in this report..."
                      aria-label="Search report rows"
                      className="w-full min-h-[36px] pl-8 pr-3 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs placeholder:text-[var(--barn-muted)]"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Interactive Tabular Output */}
            {displayedRows.length > 0 ? (
              <div>
                <div
                  ref={reportVirtual.scrollContainerRef}
                  className="max-h-[65vh] overflow-auto"
                >
                  <table className="w-full border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-[var(--barn-surface)] shadow-[0_1px_0_var(--barn-border)]">
                      <tr className="border-b border-[var(--barn-border)] bg-[var(--barn-canvas)]/90">
                        {activeReport.columns.map((col) => (
                          <th
                            key={col.key}
                            scope="col"
                            className={`px-3 py-2.5 font-semibold text-[var(--barn-muted)] whitespace-nowrap ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.label}
                          </th>
                        ))}
                        {onOpenAnimal && (
                          <th
                            scope="col"
                            className="px-3 py-2.5 font-semibold text-[var(--barn-muted)] text-right whitespace-nowrap"
                          >
                            Record
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--barn-border)]/70">
                      {reportVirtual.windowRange.paddingTop > 0 && (
                        <tr aria-hidden="true">
                          <td
                            colSpan={reportTableColCount}
                            style={{
                              height: `${reportVirtual.windowRange.paddingTop}px`,
                              padding: 0,
                              border: 0,
                            }}
                          />
                        </tr>
                      )}
                      {windowedRows.map((row, localIdx) => {
                        const rowIndex = reportVirtual.windowRange.startIndex + localIdx;
                        const rowBg =
                          row.highlightTone === 'danger'
                            ? 'bg-red-500/5 hover:bg-red-500/10'
                            : row.highlightTone === 'warning'
                            ? 'bg-[var(--barn-terracotta-tint)]/35 hover:bg-[var(--barn-terracotta-tint)]/55'
                            : row.highlightTone === 'success'
                            ? 'bg-[var(--barn-sage-tint)]/25 hover:bg-[var(--barn-sage-tint)]/45'
                            : 'hover:bg-[var(--barn-canvas)]/60';
                        return (
                          <tr
                            key={row.id}
                            ref={reportVirtual.measureRowRef(rowIndex)}
                            className={`${rowBg} transition-colors`}
                          >
                            {activeReport.columns.map((col) => {
                              const val = row.cells[col.key] ?? '';
                              return (
                                <td
                                  key={col.key}
                                  className={`px-3 py-2.5 align-top ${
                                    col.align === 'right'
                                      ? 'text-right font-mono tabular-nums whitespace-nowrap'
                                      : 'text-left'
                                  }`}
                                >
                                  {String(val)}
                                </td>
                              );
                            })}
                            {onOpenAnimal && (
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                {row.animalId ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenAnimal(row.animalId!)}
                                    className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[var(--barn-sage)] hover:underline"
                                  >
                                    Open
                                    <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                                  </button>
                                ) : (
                                  <span className="text-[var(--barn-muted)]">&mdash;</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {reportVirtual.windowRange.paddingBottom > 0 && (
                        <tr aria-hidden="true">
                          <td
                            colSpan={reportTableColCount}
                            style={{
                              height: `${reportVirtual.windowRange.paddingBottom}px`,
                              padding: 0,
                              border: 0,
                            }}
                          />
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-[var(--barn-border)] bg-[var(--barn-canvas)]/45 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-[var(--barn-muted)]">
                    Viewing{' '}
                    <span className="font-mono tabular-nums font-medium">
                      {reportVirtual.windowRange.startIndex + 1}–
                      {reportVirtual.windowRange.endIndex + 1}
                    </span>{' '}
                    of{' '}
                    <span className="font-mono tabular-nums font-medium">
                      {displayedRows.length}
                    </span>{' '}
                    rows (CSV &amp; Print include all rows)
                  </span>
                  {reportVirtual.windowRange.startIndex > 0 && (
                    <button
                      type="button"
                      onClick={reportVirtual.scrollToTop}
                      className="min-h-[36px] px-3 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] font-medium"
                    >
                      Back to Top
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm text-[var(--barn-muted)]">
                  {tableSearch.trim()
                    ? `No rows in ${activeReport.title} matched "${tableSearch}".`
                    : activeReport.emptyMessage}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    Reset Filters
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 text-center text-sm text-[var(--barn-muted)]">
          No species have been added yet. Add a species in Settings to view and export its
          per-species reports.
        </section>
      )}

      {printPreview && (
        <PrintPreviewModal
          title={printPreview.title}
          filename={printPreview.filename}
          htmlContent={printPreview.html}
          onClose={() => setPrintPreview(null)}
        />
      )}
    </div>
  );
}
