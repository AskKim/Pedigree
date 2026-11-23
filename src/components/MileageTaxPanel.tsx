/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Business Mileage & Tax Report Log Panel (`src/components/MileageTaxPanel.tsx`).
 * Mounted inside EconomicsLedgerScreen for IRS-ready mileage deductions, show/vet/feed trip
 * tracking, CSV export, and printable annual tax reports.
 */

import {
  Calculator,
  Car,
  Download,
  Edit3,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useId, useMemo, useState } from 'react';
import {
  computeMileageLogDeductionCents,
  createMileageLogDraft,
  evaluateAnnualMileageTaxSummary,
  exportMileageTaxCsv,
  generateAnnualMileageTaxHtml,
  getAvailableMileageTaxYears,
  MILEAGE_RATE_PRESETS,
  normalizeMileageLog,
} from '../core/mileageTaxLog';
import {
  BarnSettings,
  DEFAULT_IRS_MILEAGE_RATE_CENTS,
  formatCurrencyCents,
  formatReadableDate,
  MILEAGE_TRIP_PURPOSES,
  MileageLog,
  MileageTripPurpose,
  normalizeCurrencyCode,
  todayDateIso,
} from '../core/models';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextFile } from '../utils/webFileActions';
import { PrintPreviewModal } from './PrintPreviewModal';

export interface MileageTaxPanelProps {
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onSaveMileageLog: (
    draft: Omit<MileageLog, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null> | Promise<boolean> | void;
  onDeleteMileageLog: (id: string) => Promise<void> | void;
}

interface MileageFormState {
  id?: string;
  dateIso: string;
  purpose: MileageTripPurpose;
  origin: string;
  destination: string;
  roundTrip: boolean;
  miles: string;
  odometerStart: string;
  odometerEnd: string;
  rateCentsPerMile: string;
  parkingAndTolls: string;
  vehicleLabel: string;
  linkedShowId: string;
  linkedClientId: string;
  taxDeductible: boolean;
  notes: string;
}

function makeEmptyForm(): MileageFormState {
  const draft = createMileageLogDraft('Rabbit');
  return {
    dateIso: draft.dateIso,
    purpose: draft.purpose,
    origin: '',
    destination: '',
    roundTrip: true,
    miles: '',
    odometerStart: '',
    odometerEnd: '',
    rateCentsPerMile: String(DEFAULT_IRS_MILEAGE_RATE_CENTS),
    parkingAndTolls: '',
    vehicleLabel: '',
    linkedShowId: '',
    linkedClientId: '',
    taxDeductible: true,
    notes: '',
  };
}

function logToFormState(log: MileageLog): MileageFormState {
  return {
    id: log.id,
    dateIso: log.dateIso,
    purpose: log.purpose,
    origin: log.origin,
    destination: log.destination,
    roundTrip: log.roundTrip,
    miles: log.miles > 0 ? String(log.miles) : '',
    odometerStart: log.odometerStart !== undefined ? String(log.odometerStart) : '',
    odometerEnd: log.odometerEnd !== undefined ? String(log.odometerEnd) : '',
    rateCentsPerMile: String(log.rateCentsPerMile),
    parkingAndTolls:
      log.parkingAndTollsCents && log.parkingAndTollsCents > 0
        ? (log.parkingAndTollsCents / 100).toFixed(2)
        : '',
    vehicleLabel: log.vehicleLabel || '',
    linkedShowId: log.linkedShowId || '',
    linkedClientId: log.linkedClientId || '',
    taxDeductible: log.taxDeductible !== false,
    notes: log.notes || '',
  };
}

function parseDollarsToCents(raw: string): number {
  const num = Number.parseFloat(raw.replace(/[^0-9.-]/g, '').trim());
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

export function MileageTaxPanel({
  activeData,
  settings,
  onSaveMileageLog,
  onDeleteMileageLog,
}: MileageTaxPanelProps) {
  const { speciesProfile, mileageLogs, shows, clientContacts } = activeData;
  const currencyCode = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const baseId = useId();

  const availableYears = useMemo(
    () => getAvailableMileageTaxYears(mileageLogs),
    [mileageLogs]
  );

  const [yearFilter, setYearFilter] = useState<string>(() => {
    const curYear = todayDateIso().slice(0, 4);
    return availableYears.includes(curYear) || availableYears.length === 0 ? curYear : 'all';
  });
  const [purposeFilter, setPurposeFilter] = useState<'all' | MileageTripPurpose>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MileageFormState>(() => makeEmptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const submitLock = useAsyncSubmitLock({ postSettleCooldownMs: 200 });
  const deleteLock = useAsyncKeyedLock();

  const closeModal = useCallback(() => {
    setFormError(null);
    setModalOpen(false);
  }, []);

  const dialogRef = useAccessibleDialog({
    isOpen: modalOpen,
    onClose: closeModal,
  });

  const showById = useMemo(() => new Map(shows.map((s) => [s.id, s])), [shows]);
  const clientById = useMemo(
    () => new Map(clientContacts.map((c) => [c.id, c])),
    [clientContacts]
  );

  const summary = useMemo(
    () => evaluateAnnualMileageTaxSummary(mileageLogs, yearFilter),
    [mileageLogs, yearFilter]
  );

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mileageLogs.filter((log) => {
      if (yearFilter !== 'all' && !log.dateIso.startsWith(`${yearFilter}-`)) return false;
      if (purposeFilter !== 'all' && log.purpose !== purposeFilter) return false;
      if (!q) return true;
      const showName = log.linkedShowId ? showById.get(log.linkedShowId)?.name || '' : '';
      const clientName = log.linkedClientId
        ? clientById.get(log.linkedClientId)?.fullName || ''
        : '';
      return (
        log.origin.toLowerCase().includes(q) ||
        log.destination.toLowerCase().includes(q) ||
        log.purpose.toLowerCase().includes(q) ||
        (log.vehicleLabel || '').toLowerCase().includes(q) ||
        (log.notes || '').toLowerCase().includes(q) ||
        showName.toLowerCase().includes(q) ||
        clientName.toLowerCase().includes(q) ||
        log.dateIso.includes(q)
      );
    });
  }, [mileageLogs, yearFilter, purposeFilter, searchQuery, showById, clientById]);

  const draftPreviewBreakdown = useMemo(() => {
    const miles = Number.parseFloat(form.miles);
    const rate = Number.parseInt(form.rateCentsPerMile, 10);
    return computeMileageLogDeductionCents({
      miles: Number.isFinite(miles) && miles > 0 ? miles : 0,
      rateCentsPerMile: Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_IRS_MILEAGE_RATE_CENTS,
      parkingAndTollsCents: parseDollarsToCents(form.parkingAndTolls),
      taxDeductible: form.taxDeductible,
    });
  }, [form.miles, form.rateCentsPerMile, form.parkingAndTolls, form.taxDeductible]);

  const reportHtml = useMemo(() => {
    if (!printOpen) return '';
    return generateAnnualMileageTaxHtml({
      logs: mileageLogs,
      barnName: settings.barnName || 'Community Pedigree Barn',
      breederName: settings.breederName || '',
      speciesName: speciesProfile.name,
      yearLabel: yearFilter === 'all' ? 'All Years' : yearFilter,
      currencyCode,
      shows,
      clients: clientContacts,
    });
  }, [
    printOpen,
    mileageLogs,
    settings.barnName,
    settings.breederName,
    speciesProfile.name,
    yearFilter,
    currencyCode,
    shows,
    clientContacts,
  ]);

  const handleApplyOdometerDelta = () => {
    const start = Number.parseFloat(form.odometerStart);
    const end = Number.parseFloat(form.odometerEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setFormError('Enter a valid starting and higher ending odometer reading.');
      return;
    }
    setFormError(null);
    setForm((prev) => ({ ...prev, miles: (end - start).toFixed(1) }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const miles = Number.parseFloat(form.miles);
    if (!Number.isFinite(miles) || miles <= 0) {
      setFormError('Please enter miles driven greater than 0.');
      return;
    }
    const rate = Number.parseInt(form.rateCentsPerMile, 10);
    if (!Number.isFinite(rate) || rate < 0) {
      setFormError('Please enter a valid IRS mileage rate in cents per mile.');
      return;
    }
    if (!form.destination.trim()) {
      setFormError('Please enter a trip destination.');
      return;
    }
    setFormError(null);

    const odoStart = Number.parseFloat(form.odometerStart);
    const odoEnd = Number.parseFloat(form.odometerEnd);
    const normalized = normalizeMileageLog({
      id: form.id || 'temp-draft',
      species: speciesProfile.name,
      dateIso: form.dateIso || todayDateIso(),
      purpose: form.purpose,
      origin: form.origin.trim(),
      destination: form.destination.trim(),
      roundTrip: form.roundTrip,
      miles,
      ...(Number.isFinite(odoStart) && odoStart >= 0 ? { odometerStart: odoStart } : {}),
      ...(Number.isFinite(odoEnd) && odoEnd >= 0 ? { odometerEnd: odoEnd } : {}),
      rateCentsPerMile: rate,
      parkingAndTollsCents: parseDollarsToCents(form.parkingAndTolls),
      ...(form.vehicleLabel.trim() ? { vehicleLabel: form.vehicleLabel.trim() } : {}),
      ...(form.linkedShowId ? { linkedShowId: form.linkedShowId } : {}),
      ...(form.linkedClientId ? { linkedClientId: form.linkedClientId } : {}),
      taxDeductible: form.taxDeductible,
      notes: form.notes.trim(),
    });
    if (!normalized) {
      setFormError('Unable to validate trip entry.');
      return;
    }

    const res = await submitLock.runLocked(async () => {
      const saved = await onSaveMileageLog({
        ...(form.id ? { id: form.id } : {}),
        species: normalized.species,
        dateIso: normalized.dateIso,
        purpose: normalized.purpose,
        origin: normalized.origin,
        destination: normalized.destination,
        roundTrip: normalized.roundTrip,
        miles: normalized.miles,
        ...(normalized.odometerStart !== undefined
          ? { odometerStart: normalized.odometerStart }
          : {}),
        ...(normalized.odometerEnd !== undefined ? { odometerEnd: normalized.odometerEnd } : {}),
        rateCentsPerMile: normalized.rateCentsPerMile,
        ...(normalized.parkingAndTollsCents
          ? { parkingAndTollsCents: normalized.parkingAndTollsCents }
          : {}),
        ...(normalized.vehicleLabel ? { vehicleLabel: normalized.vehicleLabel } : {}),
        ...(normalized.linkedShowId ? { linkedShowId: normalized.linkedShowId } : {}),
        ...(normalized.linkedClientId ? { linkedClientId: normalized.linkedClientId } : {}),
        taxDeductible: normalized.taxDeductible,
        notes: normalized.notes,
      });
      if (saved === false || saved === null) return null;
      return typeof saved === 'string' ? saved : 'saved';
    });
    if (!res.skipped && res.value !== null) {
      setModalOpen(false);
    }
  };

  const handleExportCsv = async () => {
    const csv = exportMileageTaxCsv({
      logs: filteredLogs,
      shows,
      clients: clientContacts,
      currencyCode,
    });
    const slug = speciesProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const yr = yearFilter === 'all' ? 'all-years' : yearFilter;
    await downloadTextFile(`${slug}-mileage-tax-${yr}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const yearOptions = useMemo(() => {
    const set = new Set<string>([todayDateIso().slice(0, 4), ...availableYears]);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [availableYears]);

  return (
    <div className="space-y-6">
      {/* Toolbar & Actions */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`${baseId}-year`} className="text-xs font-medium text-[var(--barn-muted)]">
            Tax Year:
          </label>
          <select
            id={`${baseId}-year`}
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-semibold font-mono"
          >
            <option value="all">All Years</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by trip purpose"
            value={purposeFilter}
            onChange={(e) => setPurposeFilter(e.target.value as 'all' | MileageTripPurpose)}
            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
          >
            <option value="all">All Purposes</option>
            {MILEAGE_TRIP_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            Export Tax CSV
          </button>
          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            Annual Tax Report
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(makeEmptyForm());
              setFormError(null);
              setModalOpen(true);
            }}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Log Business Trip
          </button>
        </div>
      </section>

      {/* 4 Annual IRS Tax KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
            Deductible Trips
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
            {summary.deductibleTrips} / {summary.totalTrips}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">{summary.yearLabel}</div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
            Deductible Miles
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
            {summary.deductibleMiles.toFixed(1)} mi
          </div>
          <div className="text-[11px] text-[var(--barn-muted)] font-mono">
            {summary.nonDeductibleMiles > 0
              ? `+${summary.nonDeductibleMiles.toFixed(1)} non-deductible`
              : '100% IRS logged'}
          </div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
            Parking &amp; Tolls
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums">
            {formatCurrencyCents(summary.parkingAndTollsCents, currencyCode)}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">Added to mileage deduction</div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--barn-muted)]">
            Total Tax Deduction
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono tabular-nums text-[var(--barn-sage)]">
            {formatCurrencyCents(summary.totalDeductibleCents, currencyCode)}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            Mileage: {formatCurrencyCents(summary.mileageDeductionCents, currencyCode)}
          </div>
        </div>
      </div>

      {/* Purpose Breakdown */}
      {summary.byPurpose.length > 0 && (
        <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-bold text-[var(--barn-ink)]">
            Deduction Breakdown by Business Purpose ({summary.yearLabel})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--barn-border)] text-left text-[11px] uppercase text-[var(--barn-muted)]">
                  <th className="py-2 pr-3">Purpose</th>
                  <th className="py-2 px-2 text-right">Trips</th>
                  <th className="py-2 px-2 text-right">Deductible Miles</th>
                  <th className="py-2 pl-2 text-right">Estimated Deduction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--barn-border)]">
                {summary.byPurpose.map((row) => (
                  <tr key={row.purpose}>
                    <td className="py-2 pr-3 font-medium">{row.purpose}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">
                      {row.tripCount}
                    </td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">
                      {row.deductibleMiles.toFixed(1)} mi
                    </td>
                    <td className="py-2 pl-2 text-right font-mono font-bold tabular-nums text-[var(--barn-sage)]">
                      {formatCurrencyCents(row.deductibleCents, currencyCode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Trip Ledger */}
      <section className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-[var(--barn-ink)]">
            Contemporaneous Trip Ledger ({filteredLogs.length})
          </h2>
          <div className="relative w-full sm:w-64">
            <Search
              className="w-3.5 h-3.5 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search destination, show, vehicle..."
              aria-label="Search mileage trips"
              className="w-full min-h-[36px] pl-8 pr-8 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[26px] min-w-[26px] flex items-center justify-center text-[var(--barn-muted)]"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-6 text-center space-y-2">
            <Car className="w-6 h-6 text-[var(--barn-muted)] mx-auto" aria-hidden="true" />
            <p className="text-xs text-[var(--barn-muted)]">
              No mileage logs match the current filter. Track show travel, vet runs, feed pickups,
              and deliveries for IRS Schedule F / C tax deduction documentation.
            </p>
            <button
              type="button"
              onClick={() => {
                setForm(makeEmptyForm());
                setFormError(null);
                setModalOpen(true);
              }}
              className="min-h-[36px] px-4 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Log First Business Trip
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredLogs.map((log) => {
              const bd = computeMileageLogDeductionCents(log);
              const linkedShow = log.linkedShowId ? showById.get(log.linkedShowId) : undefined;
              const linkedClient = log.linkedClientId
                ? clientById.get(log.linkedClientId)
                : undefined;
              const deleting = deleteLock.isKeyLocked(`mile:${log.id}`);

              return (
                <div
                  key={log.id}
                  className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-[var(--barn-ink)]">
                        {log.origin ? `${log.origin} → ${log.destination}` : log.destination}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--barn-sage-tint)] text-[var(--barn-sage)]">
                        {log.purpose}
                      </span>
                      {log.roundTrip && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] border border-[var(--barn-border)] bg-[var(--barn-surface)] text-[var(--barn-muted)]">
                          Round Trip
                        </span>
                      )}
                      {!log.taxDeductible && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] font-medium">
                          Non-Deductible
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-[var(--barn-muted)] flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono tabular-nums">
                      <span>{formatReadableDate(log.dateIso)}</span>
                      <span>
                        {bd.miles.toFixed(1)} mi ×{' '}
                        {formatCurrencyCents(bd.rateCentsPerMile, currencyCode)}/mi
                      </span>
                      {bd.parkingAndTollsCents > 0 && (
                        <span>
                          +{formatCurrencyCents(bd.parkingAndTollsCents, currencyCode)} tolls/pkg
                        </span>
                      )}
                      {log.odometerStart !== undefined && log.odometerEnd !== undefined && (
                        <span>
                          Odo: {log.odometerStart} → {log.odometerEnd}
                        </span>
                      )}
                    </div>

                    {(log.vehicleLabel || linkedShow || linkedClient || log.notes) && (
                      <div className="text-[11px] text-[var(--barn-muted)] flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        {log.vehicleLabel && <span>Vehicle: {log.vehicleLabel}</span>}
                        {linkedShow && <span>Show: {linkedShow.name}</span>}
                        {linkedClient && <span>Client: {linkedClient.fullName}</span>}
                        {log.notes && <span className="break-words">{log.notes}</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    <span className="text-sm font-bold font-mono tabular-nums text-[var(--barn-sage)]">
                      {formatCurrencyCents(bd.deductibleCents, currencyCode)}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setForm(logToFormState(log));
                        setFormError(null);
                        setModalOpen(true);
                      }}
                      aria-label={`Edit trip to ${log.destination}`}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs inline-flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                      Edit
                    </button>

                    {confirmDeleteId === log.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() =>
                            void deleteLock.runKeyLocked(`mile:${log.id}`, async () => {
                              await onDeleteMileageLog(log.id);
                              setConfirmDeleteId(null);
                            })
                          }
                          className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white text-xs font-semibold disabled:opacity-60"
                        >
                          {deleting ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[34px] px-2 py-1 rounded-lg border border-[var(--barn-border)] text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(log.id)}
                        aria-label={`Delete trip to ${log.destination}`}
                        className="min-h-[34px] min-w-[34px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-[var(--barn-terracotta)] flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add / Edit Mileage Modal */}
      {modalOpen && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-modal-title`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <form
            onSubmit={(e) => void handleSubmit(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={`${baseId}-modal-title`} className="font-display text-lg font-bold">
                  {form.id ? 'Edit Business Mileage Trip' : 'Log Business Mileage Trip'}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Record dates, route, odometer readings, and applicable IRS mileage rate.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close mileage modal"
                className="min-h-[36px] min-w-[36px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-semibold text-[var(--barn-danger)]"
              >
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label
                  htmlFor={`${baseId}-date`}
                  className="block font-medium text-[var(--barn-muted)] mb-1"
                >
                  Trip Date *
                </label>
                <input
                  id={`${baseId}-date`}
                  type="date"
                  required
                  value={form.dateIso}
                  onChange={(e) => setForm((p) => ({ ...p, dateIso: e.target.value }))}
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-purpose`}
                  className="block font-medium text-[var(--barn-muted)] mb-1"
                >
                  Business Purpose
                </label>
                <select
                  id={`${baseId}-purpose`}
                  value={form.purpose}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, purpose: e.target.value as MileageTripPurpose }))
                  }
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {MILEAGE_TRIP_PURPOSES.map((purpose) => (
                    <option key={purpose} value={purpose}>
                      {purpose}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor={`${baseId}-vehicle`}
                  className="block font-medium text-[var(--barn-muted)] mb-1"
                >
                  Vehicle (Optional)
                </label>
                <input
                  id={`${baseId}-vehicle`}
                  type="text"
                  placeholder="e.g. Farm Truck"
                  value={form.vehicleLabel}
                  onChange={(e) => setForm((p) => ({ ...p, vehicleLabel: e.target.value }))}
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label
                  htmlFor={`${baseId}-origin`}
                  className="block font-medium text-[var(--barn-muted)] mb-1"
                >
                  Origin
                </label>
                <input
                  id={`${baseId}-origin`}
                  type="text"
                  placeholder="Home Barn"
                  value={form.origin}
                  onChange={(e) => setForm((p) => ({ ...p, origin: e.target.value }))}
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
              <div>
                <label
                  htmlFor={`${baseId}-destination`}
                  className="block font-medium text-[var(--barn-muted)] mb-1"
                >
                  Destination *
                </label>
                <input
                  id={`${baseId}-destination`}
                  type="text"
                  required
                  placeholder="County Fairgrounds / Feed Mill"
                  value={form.destination}
                  onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))}
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
            </div>

            {/* Optional Odometer Readings */}
            <div className="p-3 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[var(--barn-ink)]">
                  Odometer &amp; Distance
                </span>
                <button
                  type="button"
                  onClick={handleApplyOdometerDelta}
                  className="min-h-[28px] px-2.5 py-0.5 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-medium inline-flex items-center gap-1"
                >
                  <Calculator className="w-3 h-3" aria-hidden="true" />
                  Use Odometer Delta
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label
                    htmlFor={`${baseId}-odo-start`}
                    className="block text-[11px] text-[var(--barn-muted)] mb-1"
                  >
                    Odometer Start
                  </label>
                  <input
                    id={`${baseId}-odo-start`}
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Optional"
                    value={form.odometerStart}
                    onChange={(e) => setForm((p) => ({ ...p, odometerStart: e.target.value }))}
                    className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-odo-end`}
                    className="block text-[11px] text-[var(--barn-muted)] mb-1"
                  >
                    Odometer End
                  </label>
                  <input
                    id={`${baseId}-odo-end`}
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="Optional"
                    value={form.odometerEnd}
                    onChange={(e) => setForm((p) => ({ ...p, odometerEnd: e.target.value }))}
                    className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-miles`}
                    className="block text-[11px] text-[var(--barn-muted)] mb-1"
                  >
                    Total Miles Driven *
                  </label>
                  <input
                    id={`${baseId}-miles`}
                    type="number"
                    step="0.1"
                    min="0.1"
                    required
                    placeholder="0.0"
                    value={form.miles}
                    onChange={(e) => setForm((p) => ({ ...p, miles: e.target.value }))}
                    className="w-full min-h-[36px] px-2.5 py-1 rounded-lg bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono font-semibold"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.roundTrip}
                    onChange={(e) => setForm((p) => ({ ...p, roundTrip: e.target.checked }))}
                  />
                  <span>Round-trip route</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.taxDeductible}
                    onChange={(e) => setForm((p) => ({ ...p, taxDeductible: e.target.checked }))}
                  />
                  <span>Eligible IRS tax-deductible travel</span>
                </label>
              </div>
            </div>

            {/* IRS Rate Presets + Rate + Tolls */}
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap gap-1.5">
                {MILEAGE_RATE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        rateCentsPerMile: String(preset.rateCentsPerMile),
                      }))
                    }
                    className={`min-h-[28px] px-2.5 py-1 rounded-lg border text-[11px] font-medium ${
                      Number.parseInt(form.rateCentsPerMile, 10) === preset.rateCentsPerMile
                        ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)] text-[var(--barn-ink)] font-semibold'
                        : 'border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)]'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor={`${baseId}-rate`}
                    className="block font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Rate (cents per mile)
                  </label>
                  <input
                    id={`${baseId}-rate`}
                    type="number"
                    min="0"
                    step="1"
                    value={form.rateCentsPerMile}
                    onChange={(e) => setForm((p) => ({ ...p, rateCentsPerMile: e.target.value }))}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor={`${baseId}-tolls`}
                    className="block font-medium text-[var(--barn-muted)] mb-1"
                  >
                    Parking &amp; Tolls ({currencyCode})
                  </label>
                  <input
                    id={`${baseId}-tolls`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={form.parkingAndTolls}
                    onChange={(e) => setForm((p) => ({ ...p, parkingAndTolls: e.target.value }))}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Linked Show & Client */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label
                  htmlFor={`${baseId}-show`}
                  className="block font-medium text-[var(--barn-muted)] mb-1"
                >
                  Linked Show (Optional)
                </label>
                <select
                  id={`${baseId}-show`}
                  value={form.linkedShowId}
                  onChange={(e) => setForm((p) => ({ ...p, linkedShowId: e.target.value }))}
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">None</option>
                  {shows.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatReadableDate(s.eventDateIso)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor={`${baseId}-client`}
                  className="block font-medium text-[var(--barn-muted)] mb-1"
                >
                  Linked Client (Optional)
                </label>
                <select
                  id={`${baseId}-client`}
                  value={form.linkedClientId}
                  onChange={(e) => setForm((p) => ({ ...p, linkedClientId: e.target.value }))}
                  className="w-full min-h-[38px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">None</option>
                  {clientContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor={`${baseId}-notes`}
                className="block text-xs font-medium text-[var(--barn-muted)] mb-1"
              >
                Notes
              </label>
              <textarea
                id={`${baseId}-notes`}
                rows={2}
                placeholder="Reason for travel, toll receipt note, or trailer load summary..."
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full p-2.5 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs resize-y"
              />
            </div>

            {/* Live Deduction Summary */}
            <div className="p-3 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-[var(--barn-ink)]">
                Calculated Deduction ({draftPreviewBreakdown.miles.toFixed(1)} mi ×{' '}
                {formatCurrencyCents(draftPreviewBreakdown.rateCentsPerMile, currencyCode)} + tolls)
              </span>
              <span className="font-mono font-bold text-sm text-[var(--barn-sage)]">
                {formatCurrencyCents(draftPreviewBreakdown.deductibleCents, currencyCode)}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="min-h-[38px] px-4 py-1.5 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLock.isSubmitting}
                className="min-h-[38px] px-5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {submitLock.isSubmitting
                  ? 'Saving...'
                  : form.id
                  ? 'Save Trip Changes'
                  : 'Save Mileage Trip'}
              </button>
            </div>
          </form>
        </div>
      )}

      {printOpen && (
        <PrintPreviewModal
          title={`${speciesProfile.name} Annual Mileage & Tax Report (${
            yearFilter === 'all' ? 'All Years' : yearFilter
          })`}
          htmlContent={reportHtml}
          filename={`${speciesProfile.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')}-mileage-tax-${yearFilter}.html`}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
}
