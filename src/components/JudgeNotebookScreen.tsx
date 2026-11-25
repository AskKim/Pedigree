/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Species-Isolated Show Judge Workspace (`src/components/JudgeNotebookScreen.tsx`).
 *
 * Strictly optional module ("The Judge's Notebook") for show judges to manage:
 * - Assigned show dates & double-booking conflict alerts
 * - Bid pipeline & judging contract terms + printable `.HTM`/PDF agreements
 * - Host club & show secretary directory
 * - Travel mileage (linking directly with `MileageLog` trips) & judging expenses/reimbursements
 * - Year-scoped CSV & printable annual judging tax/earnings summaries
 */

import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  Car,
  Check,
  CheckCircle2,
  Download,
  Edit3,
  FileText,
  Gavel,
  Mail,
  MapPin,
  Phone,
  Plus,
  Printer,
  Receipt,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useId, useMemo, useState } from 'react';
import {
  buildJudgeContractFileName,
  buildJudgeCsvFileName,
  createJudgeAssignmentDraft,
  createJudgeClubDraft,
  createJudgeExpenseDraft,
  detectJudgeDateConflicts,
  evaluateJudgeAssignmentFinancials,
  exportJudgeAssignmentsCsv,
  exportJudgeExpensesCsv,
  filterJudgeAssignments,
  generateJudgeContractHtml,
  generateJudgeSummaryReportHtml,
  getAvailableJudgeYears,
  summarizeJudgeNotebook,
} from '../domain/judgeNotebook';
import {
  BarnSettings,
  DEFAULT_IRS_MILEAGE_RATE_CENTS,
  formatCurrencyCents,
  formatReadableDate,
  JUDGE_BID_STATUSES,
  JUDGE_CONTRACT_STATUSES,
  JUDGE_EXPENSE_CATEGORIES,
  JudgeAssignment,
  JudgeBidStatus,
  JudgeClubContact,
  JudgeContractStatus,
  JudgeExpense,
  JudgeExpenseCategory,
  normalizeCurrencyCode,
  todayDateIso,
} from '../domain/models';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextFile } from '../utils/webFileActions';
import { PrintPreviewModal } from './PrintPreviewModal';

export interface JudgeNotebookScreenProps {
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onBackToHub: () => void;
  onUpdateSettings: (
    patch: Partial<BarnSettings>,
    options?: { silent?: boolean }
  ) => Promise<void> | void;
  onOpenEconomics?: () => void;
  onSaveJudgeClub: (
    draft: Omit<JudgeClubContact, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null> | Promise<boolean> | void;
  onDeleteJudgeClub: (id: string) => Promise<void> | void;
  onSaveJudgeAssignment: (
    draft: Omit<JudgeAssignment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null> | Promise<boolean> | void;
  onDeleteJudgeAssignment: (id: string) => Promise<void> | void;
  onSaveJudgeExpense: (
    draft: Omit<JudgeExpense, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null> | Promise<boolean> | void;
  onDeleteJudgeExpense: (id: string) => Promise<void> | void;
}

type JudgeTabId = 'assignments' | 'contracts' | 'expenses' | 'clubs';

interface AssignmentFormState {
  id?: string;
  showName: string;
  clubId: string;
  clubName: string;
  sanctioningBody: string;
  showDateIso: string;
  endDateIso: string;
  location: string;
  venueAddress: string;
  assignmentRole: string;
  breedsAssigned: string;
  bidStatus: JudgeBidStatus;
  bidSubmittedDateIso: string;
  bidResponseDueIso: string;
  contractStatus: JudgeContractStatus;
  contractNumber: string;
  contractSignedDateIso: string;
  judgingFeeDollars: string;
  perDiemDollars: string;
  hotelProvided: boolean;
  mileageReimbursementRateCents: string;
  estimatedMiles: string;
  actualMiles: string;
  linkedMileageLogId: string;
  feePaid: boolean;
  feePaidDateIso: string;
  contractTermsSummary: string;
  notes: string;
}

interface ClubFormState {
  id?: string;
  clubName: string;
  sanctioningBody: string;
  contactPerson: string;
  roleTitle: string;
  email: string;
  phone: string;
  cityState: string;
  venueName: string;
  notes: string;
}

interface ExpenseFormState {
  id?: string;
  assignmentId: string;
  dateIso: string;
  category: JudgeExpenseCategory;
  description: string;
  vendor: string;
  amountDollars: string;
  reimbursable: boolean;
  reimbursed: boolean;
  reimbursedDateIso: string;
  taxDeductible: boolean;
  notes: string;
}

function parseDollarsToCents(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, '').trim();
  const num = Number.parseFloat(cleaned);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

function formatCentsInput(cents: number): string {
  return cents > 0 ? (cents / 100).toFixed(2) : '';
}

function parseNonNegNumber(raw: string, decimals = 1): number {
  const num = Number.parseFloat(raw.trim());
  if (!Number.isFinite(num) || num < 0) return 0;
  return Number(num.toFixed(decimals));
}

function makeEmptyAssignmentForm(species: string, club?: JudgeClubContact): AssignmentFormState {
  const draft = createJudgeAssignmentDraft(species);
  return {
    showName: '',
    clubId: club?.id || '',
    clubName: club?.clubName || '',
    sanctioningBody: club?.sanctioningBody || draft.sanctioningBody,
    showDateIso: draft.showDateIso,
    endDateIso: '',
    location: club?.cityState || '',
    venueAddress: club?.venueName || '',
    assignmentRole: draft.assignmentRole,
    breedsAssigned: '',
    bidStatus: draft.bidStatus,
    bidSubmittedDateIso: draft.bidSubmittedDateIso,
    bidResponseDueIso: '',
    contractStatus: draft.contractStatus,
    contractNumber: '',
    contractSignedDateIso: '',
    judgingFeeDollars: '',
    perDiemDollars: '',
    hotelProvided: false,
    mileageReimbursementRateCents: String(DEFAULT_IRS_MILEAGE_RATE_CENTS),
    estimatedMiles: '',
    actualMiles: '',
    linkedMileageLogId: '',
    feePaid: false,
    feePaidDateIso: '',
    contractTermsSummary: '',
    notes: '',
  };
}

function assignmentToForm(a: JudgeAssignment): AssignmentFormState {
  return {
    id: a.id,
    showName: a.showName,
    clubId: a.clubId || '',
    clubName: a.clubName,
    sanctioningBody: a.sanctioningBody,
    showDateIso: a.showDateIso,
    endDateIso: a.endDateIso,
    location: a.location,
    venueAddress: a.venueAddress,
    assignmentRole: a.assignmentRole,
    breedsAssigned: a.breedsAssigned,
    bidStatus: a.bidStatus,
    bidSubmittedDateIso: a.bidSubmittedDateIso,
    bidResponseDueIso: a.bidResponseDueIso,
    contractStatus: a.contractStatus,
    contractNumber: a.contractNumber,
    contractSignedDateIso: a.contractSignedDateIso,
    judgingFeeDollars: formatCentsInput(a.judgingFeeCents),
    perDiemDollars: formatCentsInput(a.perDiemCents),
    hotelProvided: a.hotelProvided,
    mileageReimbursementRateCents: String(a.mileageReimbursementRateCents),
    estimatedMiles: a.estimatedMiles > 0 ? String(a.estimatedMiles) : '',
    actualMiles: a.actualMiles > 0 ? String(a.actualMiles) : '',
    linkedMileageLogId: a.linkedMileageLogId || '',
    feePaid: a.feePaid,
    feePaidDateIso: a.feePaidDateIso,
    contractTermsSummary: a.contractTermsSummary,
    notes: a.notes,
  };
}

function makeEmptyClubForm(species: string): ClubFormState {
  const draft = createJudgeClubDraft(species);
  return {
    clubName: '',
    sanctioningBody: draft.sanctioningBody,
    contactPerson: '',
    roleTitle: draft.roleTitle,
    email: '',
    phone: '',
    cityState: '',
    venueName: '',
    notes: '',
  };
}

function clubToForm(c: JudgeClubContact): ClubFormState {
  return {
    id: c.id,
    clubName: c.clubName,
    sanctioningBody: c.sanctioningBody,
    contactPerson: c.contactPerson,
    roleTitle: c.roleTitle,
    email: c.email,
    phone: c.phone,
    cityState: c.cityState,
    venueName: c.venueName,
    notes: c.notes,
  };
}

function makeEmptyExpenseForm(species: string, assignmentId = ''): ExpenseFormState {
  const draft = createJudgeExpenseDraft(species);
  return {
    assignmentId,
    dateIso: draft.dateIso,
    category: draft.category,
    description: '',
    vendor: '',
    amountDollars: '',
    reimbursable: true,
    reimbursed: false,
    reimbursedDateIso: '',
    taxDeductible: true,
    notes: '',
  };
}

function expenseToForm(e: JudgeExpense): ExpenseFormState {
  return {
    id: e.id,
    assignmentId: e.assignmentId || '',
    dateIso: e.dateIso,
    category: e.category,
    description: e.description,
    vendor: e.vendor,
    amountDollars: formatCentsInput(e.amountCents),
    reimbursable: e.reimbursable,
    reimbursed: e.reimbursed,
    reimbursedDateIso: e.reimbursedDateIso,
    taxDeductible: e.taxDeductible,
    notes: e.notes,
  };
}

function getBidStatusToneClass(status: JudgeBidStatus): string {
  switch (status) {
    case 'Contracted':
    case 'Completed':
    case 'Bid Accepted':
      return 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-[var(--barn-ink)]';
    case 'Declined':
    case 'Cancelled':
      return 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] text-[var(--barn-ink)]';
    default:
      return 'border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-ink)]';
  }
}

export function JudgeNotebookScreen({
  activeData,
  settings,
  onBackToHub,
  onUpdateSettings,
  onOpenEconomics,
  onSaveJudgeClub,
  onDeleteJudgeClub,
  onSaveJudgeAssignment,
  onDeleteJudgeAssignment,
  onSaveJudgeExpense,
  onDeleteJudgeExpense,
}: JudgeNotebookScreenProps) {
  const { speciesProfile, judgeClubs, judgeAssignments, judgeExpenses, mileageLogs } = activeData;
  const currencyCode = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const baseId = useId();
  const isEnabled = Boolean(settings.enableJudgeNotebook);
  const hasAnyJudgeRecords =
    judgeAssignments.length > 0 || judgeClubs.length > 0 || judgeExpenses.length > 0;

  const availableYears = useMemo(
    () => getAvailableJudgeYears(judgeAssignments, judgeExpenses),
    [judgeAssignments, judgeExpenses]
  );

  const [yearFilter, setYearFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<JudgeTabId>('assignments');
  const [searchQuery, setSearchQuery] = useState('');
  const [bidStatusFilter, setBidStatusFilter] = useState<'all' | JudgeBidStatus>('all');
  const [contractStatusFilter, setContractStatusFilter] = useState<'all' | JudgeContractStatus>(
    'all'
  );
  const [timeframeFilter, setTimeframeFilter] = useState<'all' | 'upcoming' | 'past' | 'unpaid'>(
    'all'
  );
  const [clubSearch, setClubSearch] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<'all' | JudgeExpenseCategory>(
    'all'
  );

  // Modal editors
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(() =>
    makeEmptyAssignmentForm(speciesProfile.name)
  );
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  const [clubModalOpen, setClubModalOpen] = useState(false);
  const [clubForm, setClubForm] = useState<ClubFormState>(() =>
    makeEmptyClubForm(speciesProfile.name)
  );
  const [clubError, setClubError] = useState<string | null>(null);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>(() =>
    makeEmptyExpenseForm(speciesProfile.name)
  );
  const [expenseError, setExpenseError] = useState<string | null>(null);

  // Inline delete confirmation states (zero window.confirm)
  const [confirmDeleteAssignmentId, setConfirmDeleteAssignmentId] = useState<string | null>(null);
  const [confirmDeleteClubId, setConfirmDeleteClubId] = useState<string | null>(null);
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<string | null>(null);

  // PrintPreview modals
  const [previewContractAssignmentId, setPreviewContractAssignmentId] = useState<string | null>(
    null
  );
  const [printSummaryOpen, setPrintSummaryOpen] = useState(false);

  const submitLock = useAsyncSubmitLock({ postSettleCooldownMs: 200 });
  const actionLock = useAsyncKeyedLock();

  const closeAssignmentModal = useCallback(() => {
    setAssignmentError(null);
    setAssignmentModalOpen(false);
  }, []);
  const closeClubModal = useCallback(() => {
    setClubError(null);
    setClubModalOpen(false);
  }, []);
  const closeExpenseModal = useCallback(() => {
    setExpenseError(null);
    setExpenseModalOpen(false);
  }, []);

  const assignmentDialogRef = useAccessibleDialog({
    isOpen: assignmentModalOpen,
    onClose: closeAssignmentModal,
  });
  const clubDialogRef = useAccessibleDialog({
    isOpen: clubModalOpen,
    onClose: closeClubModal,
  });
  const expenseDialogRef = useAccessibleDialog({
    isOpen: expenseModalOpen,
    onClose: closeExpenseModal,
  });

  const dateConflicts = useMemo(
    () => detectJudgeDateConflicts(judgeAssignments),
    [judgeAssignments]
  );

  const summary = useMemo(
    () =>
      summarizeJudgeNotebook(
        judgeAssignments,
        judgeExpenses,
        judgeClubs,
        mileageLogs,
        todayDateIso(),
        yearFilter
      ),
    [judgeAssignments, judgeExpenses, judgeClubs, mileageLogs, yearFilter]
  );

  const filteredAssignments = useMemo(
    () =>
      filterJudgeAssignments(judgeAssignments, {
        query: searchQuery,
        bidStatus: bidStatusFilter,
        contractStatus: contractStatusFilter,
        year: yearFilter,
        timeframe: timeframeFilter,
      }),
    [judgeAssignments, searchQuery, bidStatusFilter, contractStatusFilter, yearFilter, timeframeFilter]
  );

  const scopedAssignmentsForReport = useMemo(
    () => filterJudgeAssignments(judgeAssignments, { year: yearFilter }),
    [judgeAssignments, yearFilter]
  );

  const assignmentById = useMemo(
    () => new Map(judgeAssignments.map((a) => [a.id, a])),
    [judgeAssignments]
  );
  const clubById = useMemo(() => new Map(judgeClubs.map((c) => [c.id, c])), [judgeClubs]);
  const mileageLogById = useMemo(() => new Map(mileageLogs.map((m) => [m.id, m])), [mileageLogs]);

  const filteredExpenses = useMemo(() => {
    const q = expenseSearch.trim().toLowerCase();
    return judgeExpenses
      .filter((e) => {
        if (yearFilter !== 'all' && !e.dateIso.startsWith(yearFilter)) return false;
        if (expenseCategoryFilter !== 'all' && e.category !== expenseCategoryFilter) return false;
        if (!q) return true;
        const linked = e.assignmentId ? assignmentById.get(e.assignmentId) : undefined;
        const hay = [
          e.description,
          e.vendor,
          e.category,
          e.notes,
          linked?.showName || '',
          linked?.clubName || '',
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => b.dateIso.localeCompare(a.dateIso));
  }, [judgeExpenses, yearFilter, expenseCategoryFilter, expenseSearch, assignmentById]);

  const filteredClubs = useMemo(() => {
    const q = clubSearch.trim().toLowerCase();
    return judgeClubs
      .filter((c) => {
        if (!q) return true;
        return [
          c.clubName,
          c.sanctioningBody,
          c.contactPerson,
          c.roleTitle,
          c.email,
          c.phone,
          c.cityState,
          c.venueName,
          c.notes,
        ]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .slice()
      .sort((a, b) => a.clubName.localeCompare(b.clubName));
  }, [judgeClubs, clubSearch]);

  const previewContractAssignment = previewContractAssignmentId
    ? assignmentById.get(previewContractAssignmentId)
    : undefined;
  const previewContractClub = previewContractAssignment?.clubId
    ? clubById.get(previewContractAssignment.clubId)
    : undefined;

  const contractHtml = useMemo(() => {
    if (!previewContractAssignment) return '';
    return generateJudgeContractHtml(previewContractAssignment, previewContractClub, settings);
  }, [previewContractAssignment, previewContractClub, settings]);

  const annualSummaryHtml = useMemo(() => {
    if (!printSummaryOpen) return '';
    return generateJudgeSummaryReportHtml({
      summary,
      assignments: scopedAssignmentsForReport,
      expenses:
        yearFilter === 'all'
          ? judgeExpenses
          : judgeExpenses.filter((e) => e.dateIso.startsWith(yearFilter)),
      mileageLogs,
      settings,
      scopeLabel: speciesProfile.name,
    });
  }, [
    printSummaryOpen,
    summary,
    scopedAssignmentsForReport,
    yearFilter,
    judgeExpenses,
    mileageLogs,
    settings,
    speciesProfile.name,
  ]);

  const handleEnableNotebook = () => {
    void actionLock.runKeyLocked('enable-notebook', () =>
      onUpdateSettings({ enableJudgeNotebook: true })
    );
  };

  const handleOpenNewAssignment = (club?: JudgeClubContact) => {
    setAssignmentError(null);
    setAssignmentForm(makeEmptyAssignmentForm(speciesProfile.name, club));
    setAssignmentModalOpen(true);
  };

  const handleOpenEditAssignment = (assignment: JudgeAssignment) => {
    setAssignmentError(null);
    setAssignmentForm(assignmentToForm(assignment));
    setAssignmentModalOpen(true);
  };

  const handleSubmitAssignment = async (e: FormEvent) => {
    e.preventDefault();
    if (!assignmentForm.showName.trim()) {
      setAssignmentError('Show or convention name is required.');
      return;
    }
    if (assignmentForm.endDateIso && assignmentForm.endDateIso < assignmentForm.showDateIso) {
      setAssignmentError('End date cannot be earlier than the show start date.');
      return;
    }
    setAssignmentError(null);
    await submitLock.runLocked(async () => {
      const rateCents = Math.max(
        0,
        Math.round(Number.parseFloat(assignmentForm.mileageReimbursementRateCents) || 0)
      );
      await onSaveJudgeAssignment({
        ...(assignmentForm.id ? { id: assignmentForm.id } : {}),
        species: speciesProfile.name,
        showName: assignmentForm.showName.trim(),
        ...(assignmentForm.clubId ? { clubId: assignmentForm.clubId } : {}),
        clubName: assignmentForm.clubName.trim(),
        sanctioningBody: assignmentForm.sanctioningBody.trim() || 'ARBA',
        showDateIso: assignmentForm.showDateIso || todayDateIso(),
        endDateIso: assignmentForm.endDateIso,
        location: assignmentForm.location.trim(),
        venueAddress: assignmentForm.venueAddress.trim(),
        assignmentRole: assignmentForm.assignmentRole.trim(),
        breedsAssigned: assignmentForm.breedsAssigned.trim(),
        bidStatus: assignmentForm.bidStatus,
        bidSubmittedDateIso: assignmentForm.bidSubmittedDateIso,
        bidResponseDueIso: assignmentForm.bidResponseDueIso,
        contractStatus: assignmentForm.contractStatus,
        contractNumber: assignmentForm.contractNumber.trim(),
        contractSignedDateIso: assignmentForm.contractSignedDateIso,
        judgingFeeCents: parseDollarsToCents(assignmentForm.judgingFeeDollars),
        perDiemCents: parseDollarsToCents(assignmentForm.perDiemDollars),
        hotelProvided: assignmentForm.hotelProvided,
        mileageReimbursementRateCents: rateCents,
        estimatedMiles: parseNonNegNumber(assignmentForm.estimatedMiles, 1),
        actualMiles: parseNonNegNumber(assignmentForm.actualMiles, 1),
        ...(assignmentForm.linkedMileageLogId
          ? { linkedMileageLogId: assignmentForm.linkedMileageLogId }
          : {}),
        feePaid: assignmentForm.feePaid,
        feePaidDateIso: assignmentForm.feePaid
          ? assignmentForm.feePaidDateIso || todayDateIso()
          : '',
        contractTermsSummary: assignmentForm.contractTermsSummary.trim(),
        notes: assignmentForm.notes.trim(),
      });
      closeAssignmentModal();
    });
  };

  const handleQuickAssignmentPatch = (
    assignment: JudgeAssignment,
    patch: Partial<JudgeAssignment>,
    lockKey: string
  ) => {
    void actionLock.runKeyLocked(`${lockKey}:${assignment.id}`, async () => {
      await onSaveJudgeAssignment({
        ...assignment,
        ...patch,
      });
    });
  };

  const handleOpenNewClub = () => {
    setClubError(null);
    setClubForm(makeEmptyClubForm(speciesProfile.name));
    setClubModalOpen(true);
  };

  const handleOpenEditClub = (club: JudgeClubContact) => {
    setClubError(null);
    setClubForm(clubToForm(club));
    setClubModalOpen(true);
  };

  const handleSubmitClub = async (e: FormEvent) => {
    e.preventDefault();
    if (!clubForm.clubName.trim()) {
      setClubError('Club or host organization name is required.');
      return;
    }
    setClubError(null);
    await submitLock.runLocked(async () => {
      await onSaveJudgeClub({
        ...(clubForm.id ? { id: clubForm.id } : {}),
        species: speciesProfile.name,
        clubName: clubForm.clubName.trim(),
        sanctioningBody: clubForm.sanctioningBody.trim() || 'ARBA',
        contactPerson: clubForm.contactPerson.trim(),
        roleTitle: clubForm.roleTitle.trim(),
        email: clubForm.email.trim(),
        phone: clubForm.phone.trim(),
        cityState: clubForm.cityState.trim(),
        venueName: clubForm.venueName.trim(),
        notes: clubForm.notes.trim(),
      });
      closeClubModal();
    });
  };

  const handleOpenNewExpense = (assignmentId = '') => {
    setExpenseError(null);
    setExpenseForm(makeEmptyExpenseForm(speciesProfile.name, assignmentId));
    setExpenseModalOpen(true);
  };

  const handleOpenEditExpense = (expense: JudgeExpense) => {
    setExpenseError(null);
    setExpenseForm(expenseToForm(expense));
    setExpenseModalOpen(true);
  };

  const handleSubmitExpense = async (e: FormEvent) => {
    e.preventDefault();
    if (!expenseForm.description.trim()) {
      setExpenseError('Expense description is required.');
      return;
    }
    const amountCents = parseDollarsToCents(expenseForm.amountDollars);
    if (amountCents <= 0) {
      setExpenseError('Enter a valid amount greater than zero.');
      return;
    }
    setExpenseError(null);
    await submitLock.runLocked(async () => {
      await onSaveJudgeExpense({
        ...(expenseForm.id ? { id: expenseForm.id } : {}),
        species: speciesProfile.name,
        ...(expenseForm.assignmentId ? { assignmentId: expenseForm.assignmentId } : {}),
        dateIso: expenseForm.dateIso || todayDateIso(),
        category: expenseForm.category,
        description: expenseForm.description.trim(),
        vendor: expenseForm.vendor.trim(),
        amountCents,
        reimbursable: expenseForm.reimbursable,
        reimbursed: expenseForm.reimbursable && expenseForm.reimbursed,
        reimbursedDateIso:
          expenseForm.reimbursable && expenseForm.reimbursed
            ? expenseForm.reimbursedDateIso || todayDateIso()
            : '',
        taxDeductible: expenseForm.taxDeductible,
        notes: expenseForm.notes.trim(),
      });
      closeExpenseModal();
    });
  };

  const handleQuickMarkExpenseReimbursed = (expense: JudgeExpense) => {
    void actionLock.runKeyLocked(`reimburse:${expense.id}`, async () => {
      await onSaveJudgeExpense({
        ...expense,
        reimbursable: true,
        reimbursed: !expense.reimbursed,
        reimbursedDateIso: !expense.reimbursed ? todayDateIso() : '',
      });
    });
  };

  const handleDownloadAssignmentsCsv = () => {
    const csv = exportJudgeAssignmentsCsv(
      filteredAssignments,
      judgeExpenses,
      mileageLogs,
      currencyCode
    );
    downloadTextFile(
      buildJudgeCsvFileName('assignments', speciesProfile.name),
      csv,
      'text/csv;charset=utf-8'
    );
  };

  const handleDownloadExpensesCsv = () => {
    const csv = exportJudgeExpensesCsv(filteredExpenses, judgeAssignments, currencyCode);
    downloadTextFile(
      buildJudgeCsvFileName('expenses', speciesProfile.name),
      csv,
      'text/csv;charset=utf-8'
    );
  };

  // Strictly optional activation gate when disabled and empty
  if (!isEnabled && !hasAnyJudgeRecords) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToHub}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to {speciesProfile.name} Hub</span>
          </button>
        </div>

        <section className="max-w-2xl mx-auto bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[var(--barn-sage)] flex items-center justify-center shrink-0">
              <Gavel className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-2xl font-semibold">
                The Judge&apos;s Notebook
              </h1>
              <p className="text-xs sm:text-sm text-[var(--barn-muted)]">
                Optional workspace for licensed show judges officiating {speciesProfile.name} events.
                Keep your judging calendar, club contacts, bid pipeline, contracts, travel mileage,
                and judging expenses cleanly organized offline alongside your barn records.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1">
              <div className="font-semibold text-[var(--barn-ink)]">Show Schedule &amp; Conflict Alerts</div>
              <p className="text-[var(--barn-muted)]">
                Track inquiries, bids, and contracted weekends with automatic double-booking overlap checks.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1">
              <div className="font-semibold text-[var(--barn-ink)]">Contracts &amp; Fee Ledger</div>
              <p className="text-[var(--barn-muted)]">
                Store contract numbers, judging fees, per diem, lodging terms, and print/PDF agreements.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1">
              <div className="font-semibold text-[var(--barn-ink)]">Travel Mileage &amp; Reimbursements</div>
              <p className="text-[var(--barn-muted)]">
                Link assignments to Mileage Tax trips and separate reimbursable club expenses from tax deductions.
              </p>
            </div>
            <div className="p-3.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] space-y-1">
              <div className="font-semibold text-[var(--barn-ink)]">Host Club Directory</div>
              <p className="text-[var(--barn-muted)]">
                Keep show secretary contacts, venue addresses, and sanctioning bodies ready for quick bids.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              disabled={actionLock.isKeyLocked('enable-notebook')}
              onClick={handleEnableNotebook}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold hover:opacity-95 disabled:opacity-60 inline-flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>Enable The Judge&apos;s Notebook</span>
            </button>
            <button
              type="button"
              onClick={onBackToHub}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium"
            >
              Not Right Now
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Top Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToHub}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{speciesProfile.name} Hub</span>
            </button>
            <span className="text-xs text-[var(--barn-muted)]">· Optional Show Judge Module</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2.5">
            <Gavel className="w-6 h-6 text-[var(--barn-sage)] shrink-0" aria-hidden="true" />
            <span>The Judge&apos;s Notebook</span>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--barn-muted)]">
            Assigned {speciesProfile.name.toLowerCase()} shows, bids, judging contracts, club contacts,
            travel mileage, and judging expense logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl px-3 min-h-[40px]">
            <Calendar className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            <span className="text-[var(--barn-muted)]">Year:</span>
            <select
              aria-label="Filter by year"
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="bg-transparent font-mono text-xs font-semibold focus:outline-none"
            >
              <option value="all">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={handleDownloadAssignmentsCsv}
            disabled={filteredAssignments.length === 0}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            <span>Shows CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadExpensesCsv}
            disabled={filteredExpenses.length === 0}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            <span>Expenses CSV</span>
          </button>

          <button
            type="button"
            onClick={() => setPrintSummaryOpen(true)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] hover:brightness-105 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            <span>Annual Report</span>
          </button>
        </div>
      </div>

      {/* Re-enable banner if module disabled while historical records exist */}
      {!isEnabled && (
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-3">
          <span className="text-[var(--barn-muted)]">
            The Judge&apos;s Notebook dashboard shortcut is currently hidden in Barn Preferences,
            but your existing judging records remain preserved here.
          </span>
          <button
            type="button"
            disabled={actionLock.isKeyLocked('enable-notebook')}
            onClick={handleEnableNotebook}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] font-semibold"
          >
            Pin Shortcut to Hub
          </button>
        </div>
      )}

      {/* Date-Overlap Conflict Warning Banner */}
      {dateConflicts.length > 0 && (
        <div
          role="alert"
          className="bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] rounded-2xl p-4 space-y-2 text-xs"
        >
          <div className="flex items-center gap-2 font-semibold text-[var(--barn-ink)]">
            <AlertTriangle
              className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0"
              aria-hidden="true"
            />
            <span>
              {dateConflicts.length} Show Date Overlap{dateConflicts.length === 1 ? '' : 's'} Detected
            </span>
          </div>
          <ul className="space-y-1 pl-6 list-disc text-[var(--barn-muted)]">
            {dateConflicts.map((c) => (
              <li key={`${c.assignmentIdA}:${c.assignmentIdB}`}>
                <strong className="text-[var(--barn-ink)]">{c.showNameA}</strong> ({c.dateRangeA})
                overlaps <strong className="text-[var(--barn-ink)]">{c.showNameB}</strong> (
                {c.dateRangeB})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4-Metric KPI Strip */}
      <section
        aria-label="Judging overview metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)] uppercase tracking-wider">
            Shows &amp; Bid Pipeline
          </div>
          <div className="font-mono text-xl font-bold tabular-nums">
            {summary.totalAssignments} show{summary.totalAssignments === 1 ? '' : 's'}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
            {summary.upcomingAssignmentsCount} upcoming · {summary.pendingBidsCount} pending bids ·{' '}
            {summary.completedShowsCount} done
          </div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)] uppercase tracking-wider">
            Contracts &amp; Host Clubs
          </div>
          <div className="font-mono text-xl font-bold tabular-nums">
            {summary.unsignedContractsCount} unsigned
          </div>
          <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
            {summary.totalClubsCount} club contact{summary.totalClubsCount === 1 ? '' : 's'} in directory
          </div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)] uppercase tracking-wider">
            Travel Mileage ({summary.yearLabel})
          </div>
          <div className="font-mono text-xl font-bold tabular-nums">
            {summary.totalMiles.toFixed(1)} mi
          </div>
          <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
            Allowance est. {formatCurrencyCents(summary.mileageAllowanceCents, currencyCode)}
          </div>
        </div>

        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)] uppercase tracking-wider">
            Net Judging Earnings
          </div>
          <div className="font-mono text-xl font-bold tabular-nums">
            {formatCurrencyCents(summary.netJudgingEarningsCents, currencyCode)}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
            Unpaid fees/reimb:{' '}
            {formatCurrencyCents(
              summary.unpaidFeesCents + summary.pendingReimbursementCents,
              currencyCode
            )}
          </div>
        </div>
      </section>

      {/* Segmented Workspace Tabs */}
      <div
        role="tablist"
        aria-label="Judge's Notebook sections"
        className="flex flex-wrap gap-1.5 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-1.5"
      >
        {(
          [
            {
              id: 'assignments',
              label: `Shows & Bids (${judgeAssignments.length})`,
              icon: Calendar,
            },
            {
              id: 'contracts',
              label: `Contracts & Pipeline (${summary.unsignedContractsCount} open)`,
              icon: FileText,
            },
            {
              id: 'expenses',
              label: `Expenses & Mileage (${judgeExpenses.length})`,
              icon: Receipt,
            },
            {
              id: 'clubs',
              label: `Club Contacts (${judgeClubs.length})`,
              icon: Building2,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-2 ${
                active
                  ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                  : 'text-[var(--barn-muted)] hover:text-[var(--barn-ink)] hover:bg-[var(--barn-subtle)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SHOWS & BIDS */}
      {activeTab === 'assignments' && (
        <section className="space-y-4">
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search show name, club, breeds, location..."
                  aria-label="Search shows and bids"
                  className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>

              <select
                aria-label="Filter by bid status"
                value={bidStatusFilter}
                onChange={(e) =>
                  setBidStatusFilter(e.target.value as 'all' | JudgeBidStatus)
                }
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                <option value="all">All Bid Statuses</option>
                {JUDGE_BID_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by contract status"
                value={contractStatusFilter}
                onChange={(e) =>
                  setContractStatusFilter(e.target.value as 'all' | JudgeContractStatus)
                }
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                <option value="all">All Contracts</option>
                {JUDGE_CONTRACT_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by timeframe"
                value={timeframeFilter}
                onChange={(e) =>
                  setTimeframeFilter(
                    e.target.value as 'all' | 'upcoming' | 'past' | 'unpaid'
                  )
                }
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                <option value="all">All Dates</option>
                <option value="upcoming">Upcoming</option>
                <option value="past">Past / Completed</option>
                <option value="unpaid">Unpaid Fees</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => handleOpenNewAssignment()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Add Show / Bid</span>
            </button>
          </div>

          {filteredAssignments.length === 0 ? (
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm font-semibold">No matching judging shows or bids yet</p>
              <p className="text-xs text-[var(--barn-muted)] max-w-md mx-auto">
                Log your first judging inquiry, submitted bid, or confirmed show weekend to track
                conflicts, contracts, fees, and mileage.
              </p>
              <button
                type="button"
                onClick={() => handleOpenNewAssignment()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Log Show Assignment</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAssignments.map((a) => {
                const fin = evaluateJudgeAssignmentFinancials(a, judgeExpenses, mileageLogs);
                const dateDisplay =
                  a.endDateIso && a.endDateIso !== a.showDateIso
                    ? `${formatReadableDate(a.showDateIso)} – ${formatReadableDate(a.endDateIso)}`
                    : formatReadableDate(a.showDateIso);
                const linkedTrip = a.linkedMileageLogId
                  ? mileageLogById.get(a.linkedMileageLogId)
                  : undefined;

                return (
                  <article
                    key={a.id}
                    className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-lg font-semibold text-[var(--barn-ink)]">
                            {a.showName}
                          </h2>
                          <span
                            className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold ${getBidStatusToneClass(a.bidStatus)}`}
                          >
                            {a.bidStatus}
                          </span>
                          <span className="px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] font-medium text-[var(--barn-muted)]">
                            Contract: {a.contractStatus}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--barn-muted)]">
                          <span className="inline-flex items-center gap-1 font-medium text-[var(--barn-ink)]">
                            <Calendar className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                            {dateDisplay}
                          </span>
                          {a.clubName && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5" aria-hidden="true" />
                              {a.clubName} ({a.sanctioningBody})
                            </span>
                          )}
                          {a.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                              {a.location}
                            </span>
                          )}
                        </div>
                        {(a.assignmentRole || a.breedsAssigned) && (
                          <p className="text-xs text-[var(--barn-muted)]">
                            {a.assignmentRole}
                            {a.assignmentRole && a.breedsAssigned ? ' · ' : ''}
                            {a.breedsAssigned}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewContractAssignmentId(a.id)}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                          <span>Contract</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('expenses');
                            handleOpenNewExpense(a.id);
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
                        >
                          <Receipt className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                          <span>+ Expense</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditAssignment(a)}
                          aria-label={`Edit ${a.showName}`}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Edit</span>
                        </button>
                        {confirmDeleteAssignmentId === a.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={actionLock.isKeyLocked(`del-assign:${a.id}`)}
                              onClick={() =>
                                void actionLock.runKeyLocked(`del-assign:${a.id}`, async () => {
                                  await onDeleteJudgeAssignment(a.id);
                                  setConfirmDeleteAssignmentId(null);
                                })
                              }
                              className="min-h-[36px] px-2.5 py-1 rounded-xl bg-[var(--barn-terracotta)] text-white text-xs font-semibold"
                            >
                              Confirm Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteAssignmentId(null)}
                              className="min-h-[36px] px-2 py-1 rounded-xl border border-[var(--barn-border)] text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteAssignmentId(a.id)}
                            aria-label={`Delete ${a.showName}`}
                            className="min-h-[36px] min-w-[36px] rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-terracotta-tint)] text-[var(--barn-muted)] hover:text-[var(--barn-terracotta)] inline-flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Financials & Quick Status Footer */}
                    <div className="pt-2.5 border-t border-[var(--barn-border)]/70 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums">
                        <span>
                          Fee+PerDiem:{' '}
                          <strong>
                            {formatCurrencyCents(fin.grossFeeAndPerDiemCents, currencyCode)}
                          </strong>
                        </span>
                        <span>
                          Miles: <strong>{fin.effectiveMiles.toFixed(1)} mi</strong> (
                          {formatCurrencyCents(fin.mileageAllowanceCents, currencyCode)})
                          {linkedTrip ? ` · Trip: ${linkedTrip.destination || linkedTrip.dateIso}` : ''}
                        </span>
                        <span>
                          Expenses:{' '}
                          <strong>{formatCurrencyCents(fin.totalExpensesCents, currencyCode)}</strong>
                          {fin.pendingReimbursementCents > 0
                            ? ` (${formatCurrencyCents(fin.pendingReimbursementCents, currencyCode)} reimb. due)`
                            : ''}
                        </span>
                        <span>
                          Hotel: <strong>{a.hotelProvided ? 'Provided' : 'Self'}</strong>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.bidStatus === 'Bid Submitted' && (
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickAssignmentPatch(
                                a,
                                { bidStatus: 'Bid Accepted' },
                                'accept-bid'
                              )
                            }
                            className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-sage)] text-[11px] font-semibold hover:bg-[var(--barn-sage-tint)]"
                          >
                            Mark Bid Accepted
                          </button>
                        )}
                        {a.contractStatus !== 'Signed by Both' &&
                          a.contractStatus !== 'Completed' &&
                          a.bidStatus !== 'Declined' &&
                          a.bidStatus !== 'Cancelled' && (
                            <button
                              type="button"
                              onClick={() =>
                                handleQuickAssignmentPatch(
                                  a,
                                  {
                                    bidStatus: 'Contracted',
                                    contractStatus: 'Signed by Both',
                                    contractSignedDateIso:
                                      a.contractSignedDateIso || todayDateIso(),
                                  },
                                  'sign-contract'
                                )
                              }
                              className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-sage)] text-[11px] font-semibold hover:bg-[var(--barn-sage-tint)]"
                            >
                              Mark Contract Signed
                            </button>
                          )}
                        {a.judgingFeeCents + a.perDiemCents > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickAssignmentPatch(
                                a,
                                {
                                  feePaid: !a.feePaid,
                                  feePaidDateIso: !a.feePaid ? todayDateIso() : '',
                                },
                                'toggle-fee-paid'
                              )
                            }
                            className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 ${
                              a.feePaid
                                ? 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)]'
                                : 'border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                            }`}
                          >
                            <Check className="w-3 h-3" aria-hidden="true" />
                            <span>{a.feePaid ? 'Fee Paid' : 'Mark Fee Paid'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: CONTRACTS & BID PIPELINE */}
      {activeTab === 'contracts' && (
        <section className="space-y-4">
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">
                Contracts &amp; Bid Response Pipeline
              </h2>
              <p className="text-xs text-[var(--barn-muted)]">
                Track submitted bids, response deadlines, signed contracts, and generate printable
                Judging Agreements for clubs.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenNewAssignment()}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New Show Contract</span>
            </button>
          </div>

          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px] uppercase tracking-wider text-[var(--barn-muted)]">
                  <th className="py-3 px-4">Show Date</th>
                  <th className="py-3 px-4">Show &amp; Club</th>
                  <th className="py-3 px-4">Bid Status / Due</th>
                  <th className="py-3 px-4">Contract # / Status</th>
                  <th className="py-3 px-4">Fee &amp; Payment</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--barn-border)]">
                {scopedAssignmentsForReport.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-[var(--barn-muted)]">
                      No contracts or bids recorded for this scope yet.
                    </td>
                  </tr>
                ) : (
                  scopedAssignmentsForReport.map((a) => (
                    <tr key={a.id} className="hover:bg-[var(--barn-canvas)]/60">
                      <td className="py-3 px-4 font-mono tabular-nums whitespace-nowrap">
                        {a.showDateIso}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[var(--barn-ink)]">{a.showName}</div>
                        <div className="text-[11px] text-[var(--barn-muted)]">
                          {a.clubName || 'No club assigned'} · {a.sanctioningBody}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{a.bidStatus}</div>
                        {a.bidResponseDueIso && (
                          <div className="text-[11px] text-[var(--barn-muted)] font-mono">
                            Due {a.bidResponseDueIso}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{a.contractStatus}</div>
                        <div className="text-[11px] text-[var(--barn-muted)] font-mono">
                          {a.contractNumber ? `#${a.contractNumber}` : 'No #'}
                          {a.contractSignedDateIso ? ` · Signed ${a.contractSignedDateIso}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <div>
                          {formatCurrencyCents(a.judgingFeeCents + a.perDiemCents, currencyCode)}
                        </div>
                        <div className="text-[11px] text-[var(--barn-muted)]">
                          {a.feePaid
                            ? `Paid ${a.feePaidDateIso || ''}`
                            : 'Unpaid'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPreviewContractAssignmentId(a.id)}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>View Agreement</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditAssignment(a)}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs"
                          >
                            Terms
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: EXPENSES & MILEAGE */}
      {activeTab === 'expenses' && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] text-[var(--barn-muted)] uppercase">Total Expenses</div>
              <div className="font-mono text-lg font-bold tabular-nums">
                {formatCurrencyCents(summary.totalExpensesCents, currencyCode)}
              </div>
            </div>
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] text-[var(--barn-muted)] uppercase">
                Pending Club Reimbursement
              </div>
              <div className="font-mono text-lg font-bold tabular-nums">
                {formatCurrencyCents(summary.pendingReimbursementCents, currencyCode)}
              </div>
            </div>
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
              <div className="text-[11px] text-[var(--barn-muted)] uppercase">
                Unreimbursed Tax-Deductible
              </div>
              <div className="font-mono text-lg font-bold tabular-nums">
                {formatCurrencyCents(summary.taxDeductibleExpensesCents, currencyCode)}
              </div>
            </div>
          </div>

          {/* Linked Mileage Log Integration Strip */}
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-[var(--barn-sage)]" aria-hidden="true" />
                <h2 className="font-display text-base font-semibold">
                  Show Travel Mileage Integration ({summary.totalMiles.toFixed(1)} mi total)
                </h2>
              </div>
              {onOpenEconomics && (
                <button
                  type="button"
                  onClick={onOpenEconomics}
                  className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)] text-xs font-medium"
                >
                  Open Mileage Tax Log ({mileageLogs.length} trips)
                </button>
              )}
            </div>
            <p className="text-xs text-[var(--barn-muted)]">
              Each show assignment uses Actual Miles first, then any linked Mileage Tax Log trip,
              then Estimated Miles. Edit any assignment to link a recorded Mileage Log trip.
            </p>
          </div>

          {/* Expense Toolbar */}
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search
                  className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  placeholder="Search expense, vendor, linked show..."
                  aria-label="Search judging expenses"
                  className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
                />
              </div>
              <select
                aria-label="Filter expense category"
                value={expenseCategoryFilter}
                onChange={(e) =>
                  setExpenseCategoryFilter(e.target.value as 'all' | JudgeExpenseCategory)
                }
                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              >
                <option value="all">All Categories</option>
                {JUDGE_EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => handleOpenNewExpense()}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Log Judging Expense</span>
            </button>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-2">
              <p className="text-sm font-semibold">No judging expenses logged in this filter</p>
              <p className="text-xs text-[var(--barn-muted)]">
                Record airfare, hotel, meals, judging coats, or license renewals and track club
                reimbursements.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredExpenses.map((exp) => {
                const linkedShow = exp.assignmentId
                  ? assignmentById.get(exp.assignmentId)
                  : undefined;
                return (
                  <div
                    key={exp.id}
                    className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] text-[var(--barn-muted)]">
                          {exp.dateIso}
                        </span>
                        <span className="font-semibold text-sm text-[var(--barn-ink)]">
                          {exp.description}
                        </span>
                        <span className="px-2 py-0.5 rounded-md border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[11px]">
                          {exp.category}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[var(--barn-muted)]">
                        {exp.vendor && <span>Vendor: {exp.vendor}</span>}
                        {linkedShow && <span>Show: {linkedShow.showName}</span>}
                        <span>
                          {exp.reimbursable
                            ? exp.reimbursed
                              ? `Reimbursed ${exp.reimbursedDateIso || ''}`
                              : 'Reimbursable (Pending)'
                            : 'Not Reimbursable'}
                        </span>
                        <span>{exp.taxDeductible ? 'Tax-Deductible' : 'Non-Deductible'}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span className="font-mono text-sm font-bold tabular-nums mr-1">
                        {formatCurrencyCents(exp.amountCents, currencyCode)}
                      </span>
                      {exp.reimbursable && (
                        <button
                          type="button"
                          onClick={() => handleQuickMarkExpenseReimbursed(exp)}
                          className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                            exp.reimbursed
                              ? 'border-[var(--barn-sage)] bg-[var(--barn-sage-tint)]'
                              : 'border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]'
                          }`}
                        >
                          {exp.reimbursed ? 'Reimbursed' : 'Mark Reimbursed'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleOpenEditExpense(exp)}
                        aria-label={`Edit ${exp.description}`}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
                      >
                        Edit
                      </button>
                      {confirmDeleteExpenseId === exp.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={actionLock.isKeyLocked(`del-exp:${exp.id}`)}
                            onClick={() =>
                              void actionLock.runKeyLocked(`del-exp:${exp.id}`, async () => {
                                await onDeleteJudgeExpense(exp.id);
                                setConfirmDeleteExpenseId(null);
                              })
                            }
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white font-semibold"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteExpenseId(null)}
                            className="min-h-[34px] px-2 py-1 rounded-lg border border-[var(--barn-border)]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteExpenseId(exp.id)}
                          aria-label={`Delete ${exp.description}`}
                          className="min-h-[34px] min-w-[34px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-terracotta-tint)] text-[var(--barn-muted)] hover:text-[var(--barn-terracotta)] inline-flex items-center justify-center"
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
      )}

      {/* TAB 4: CLUB CONTACTS DIRECTORY */}
      {activeTab === 'clubs' && (
        <section className="space-y-4">
          <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={clubSearch}
                onChange={(e) => setClubSearch(e.target.value)}
                placeholder="Search club name, secretary, city, venue..."
                aria-label="Search host clubs"
                className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
              />
            </div>

            <button
              type="button"
              onClick={handleOpenNewClub}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center justify-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Add Club Contact</span>
            </button>
          </div>

          {filteredClubs.length === 0 ? (
            <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-8 text-center space-y-3">
              <p className="text-sm font-semibold">No host clubs saved yet</p>
              <p className="text-xs text-[var(--barn-muted)] max-w-md mx-auto">
                Add show clubs, superintendents, and secretaries so new judging bids and contracts
                auto-fill venue and contact details.
              </p>
              <button
                type="button"
                onClick={handleOpenNewClub}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Add First Club</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredClubs.map((club) => {
                const showCount = judgeAssignments.filter((a) => a.clubId === club.id).length;
                return (
                  <article
                    key={club.id}
                    className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-base font-semibold text-[var(--barn-ink)]">
                          {club.clubName}
                        </h3>
                        <div className="text-[11px] text-[var(--barn-muted)]">
                          {club.sanctioningBody} · {showCount} assignment{showCount === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditClub(club)}
                          aria-label={`Edit ${club.clubName}`}
                          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-subtle)]"
                        >
                          Edit
                        </button>
                        {confirmDeleteClubId === club.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={actionLock.isKeyLocked(`del-club:${club.id}`)}
                              onClick={() =>
                                void actionLock.runKeyLocked(`del-club:${club.id}`, async () => {
                                  await onDeleteJudgeClub(club.id);
                                  setConfirmDeleteClubId(null);
                                })
                              }
                              className="min-h-[34px] px-2 py-1 rounded-lg bg-[var(--barn-terracotta)] text-white font-semibold"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteClubId(null)}
                              className="min-h-[34px] px-2 py-1 rounded-lg border border-[var(--barn-border)]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteClubId(club.id)}
                            aria-label={`Delete ${club.clubName}`}
                            className="min-h-[34px] min-w-[34px] rounded-lg border border-[var(--barn-border)] hover:bg-[var(--barn-terracotta-tint)] text-[var(--barn-muted)] hover:text-[var(--barn-terracotta)] inline-flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 text-[var(--barn-muted)]">
                      {club.contactPerson && (
                        <div>
                          <strong className="text-[var(--barn-ink)]">{club.contactPerson}</strong>
                          {club.roleTitle ? ` (${club.roleTitle})` : ''}
                        </div>
                      )}
                      {club.email && (
                        <div className="inline-flex items-center gap-1.5 mr-4">
                          <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{club.email}</span>
                        </div>
                      )}
                      {club.phone && (
                        <div className="inline-flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{club.phone}</span>
                        </div>
                      )}
                      {(club.cityState || club.venueName) && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {[club.venueName, club.cityState].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      )}
                      {club.notes && <p className="pt-1 text-[11px]">{club.notes}</p>}
                    </div>

                    <div className="pt-2 border-t border-[var(--barn-border)]/70">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('assignments');
                          handleOpenNewAssignment(club);
                        }}
                        className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-sage)] bg-[var(--barn-sage-tint)] text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>New Show Bid for Club</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ASSIGNMENT EDITOR MODAL */}
      {assignmentModalOpen && (
        <div
          ref={assignmentDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-assign-title`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAssignmentModal();
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSubmitAssignment(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={`${baseId}-assign-title`} className="font-display text-xl font-semibold">
                  {assignmentForm.id ? 'Edit Show Assignment' : 'New Show Assignment / Bid'}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Manage show dates, bid progress, contract terms, fee payments, and mileage.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAssignmentModal}
                aria-label="Close show assignment modal"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {assignmentError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium"
              >
                {assignmentError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-showName`} className="block font-semibold mb-1">
                  Show / Convention Name *
                </label>
                <input
                  id={`${baseId}-showName`}
                  type="text"
                  required
                  value={assignmentForm.showName}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, showName: e.target.value }))
                  }
                  placeholder="e.g., Tri-County Spring Double Open"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-clubPick`} className="block font-semibold mb-1">
                  Club Contact Directory
                </label>
                <select
                  id={`${baseId}-clubPick`}
                  value={assignmentForm.clubId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    const club = clubById.get(nextId);
                    setAssignmentForm((prev) => ({
                      ...prev,
                      clubId: nextId,
                      clubName: club ? club.clubName : prev.clubName,
                      sanctioningBody: club ? club.sanctioningBody : prev.sanctioningBody,
                      location: club && !prev.location ? club.cityState : prev.location,
                      venueAddress: club && !prev.venueAddress ? club.venueName : prev.venueAddress,
                    }));
                  }}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">— Custom / Unlinked Club —</option>
                  {judgeClubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.clubName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${baseId}-clubName`} className="block font-semibold mb-1">
                  Host Club Name
                </label>
                <input
                  id={`${baseId}-clubName`}
                  type="text"
                  value={assignmentForm.clubName}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, clubName: e.target.value }))
                  }
                  placeholder="Host club or fairgrounds"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-sanction`} className="block font-semibold mb-1">
                  Sanctioning Body
                </label>
                <input
                  id={`${baseId}-sanction`}
                  type="text"
                  value={assignmentForm.sanctioningBody}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, sanctioningBody: e.target.value }))
                  }
                  placeholder="ARBA, ADGA, 4-H..."
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-role`} className="block font-semibold mb-1">
                  Assignment Role
                </label>
                <input
                  id={`${baseId}-role`}
                  type="text"
                  value={assignmentForm.assignmentRole}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, assignmentRole: e.target.value }))
                  }
                  placeholder="All-Breed Open & Youth"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-showDate`} className="block font-semibold mb-1">
                  Show Start Date
                </label>
                <input
                  id={`${baseId}-showDate`}
                  type="date"
                  required
                  value={assignmentForm.showDateIso}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, showDateIso: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-endDate`} className="block font-semibold mb-1">
                  Show End Date (if multi-day)
                </label>
                <input
                  id={`${baseId}-endDate`}
                  type="date"
                  value={assignmentForm.endDateIso}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, endDateIso: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-location`} className="block font-semibold mb-1">
                  City / State
                </label>
                <input
                  id={`${baseId}-location`}
                  type="text"
                  value={assignmentForm.location}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-venue`} className="block font-semibold mb-1">
                  Venue / Fairgrounds Address
                </label>
                <input
                  id={`${baseId}-venue`}
                  type="text"
                  value={assignmentForm.venueAddress}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, venueAddress: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-breeds`} className="block font-semibold mb-1">
                  Breeds / Specialties Assigned
                </label>
                <input
                  id={`${baseId}-breeds`}
                  type="text"
                  value={assignmentForm.breedsAssigned}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, breedsAssigned: e.target.value }))
                  }
                  placeholder="Holland Lop, Mini Rex, Netherland Dwarf, BIS"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-bidStatus`} className="block font-semibold mb-1">
                  Bid Status
                </label>
                <select
                  id={`${baseId}-bidStatus`}
                  value={assignmentForm.bidStatus}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      bidStatus: e.target.value as JudgeBidStatus,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {JUDGE_BID_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${baseId}-contractStatus`} className="block font-semibold mb-1">
                  Contract Status
                </label>
                <select
                  id={`${baseId}-contractStatus`}
                  value={assignmentForm.contractStatus}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      contractStatus: e.target.value as JudgeContractStatus,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {JUDGE_CONTRACT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${baseId}-bidSubmitted`} className="block font-semibold mb-1">
                  Bid Submitted Date
                </label>
                <input
                  id={`${baseId}-bidSubmitted`}
                  type="date"
                  value={assignmentForm.bidSubmittedDateIso}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, bidSubmittedDateIso: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-bidDue`} className="block font-semibold mb-1">
                  Bid Response Due
                </label>
                <input
                  id={`${baseId}-bidDue`}
                  type="date"
                  value={assignmentForm.bidResponseDueIso}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, bidResponseDueIso: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-contractNum`} className="block font-semibold mb-1">
                  Contract / Agreement #
                </label>
                <input
                  id={`${baseId}-contractNum`}
                  type="text"
                  value={assignmentForm.contractNumber}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, contractNumber: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-signedDate`} className="block font-semibold mb-1">
                  Contract Signed Date
                </label>
                <input
                  id={`${baseId}-signedDate`}
                  type="date"
                  value={assignmentForm.contractSignedDateIso}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      contractSignedDateIso: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-fee`} className="block font-semibold mb-1">
                  Judging Fee ({currencyCode})
                </label>
                <input
                  id={`${baseId}-fee`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={assignmentForm.judgingFeeDollars}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, judgingFeeDollars: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-perDiem`} className="block font-semibold mb-1">
                  Per Diem / Meals ({currencyCode})
                </label>
                <input
                  id={`${baseId}-perDiem`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={assignmentForm.perDiemDollars}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, perDiemDollars: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-estMiles`} className="block font-semibold mb-1">
                  Estimated Round-Trip Miles
                </label>
                <input
                  id={`${baseId}-estMiles`}
                  type="number"
                  min="0"
                  step="0.1"
                  value={assignmentForm.estimatedMiles}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, estimatedMiles: e.target.value }))
                  }
                  placeholder="0.0"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-actMiles`} className="block font-semibold mb-1">
                  Actual Miles Driven
                </label>
                <input
                  id={`${baseId}-actMiles`}
                  type="number"
                  min="0"
                  step="0.1"
                  value={assignmentForm.actualMiles}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, actualMiles: e.target.value }))
                  }
                  placeholder="0.0"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-mileRate`} className="block font-semibold mb-1">
                  Mileage Rate (cents / mile)
                </label>
                <input
                  id={`${baseId}-mileRate`}
                  type="number"
                  min="0"
                  step="1"
                  value={assignmentForm.mileageReimbursementRateCents}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      mileageReimbursementRateCents: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-mileLog`} className="block font-semibold mb-1">
                  Linked Mileage Tax Trip
                </label>
                <select
                  id={`${baseId}-mileLog`}
                  value={assignmentForm.linkedMileageLogId}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, linkedMileageLogId: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">— None Linked —</option>
                  {mileageLogs.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.dateIso} · {m.destination || m.purpose} ({m.miles.toFixed(1)} mi)
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignmentForm.hotelProvided}
                    onChange={(e) =>
                      setAssignmentForm((prev) => ({ ...prev, hotelProvided: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Hotel / Lodging Provided by Host Club</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignmentForm.feePaid}
                    onChange={(e) =>
                      setAssignmentForm((prev) => ({ ...prev, feePaid: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Judging Fee Paid</span>
                </label>

                {assignmentForm.feePaid && (
                  <input
                    type="date"
                    aria-label="Fee paid date"
                    value={assignmentForm.feePaidDateIso}
                    onChange={(e) =>
                      setAssignmentForm((prev) => ({ ...prev, feePaidDateIso: e.target.value }))
                    }
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                  />
                )}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-terms`} className="block font-semibold mb-1">
                  Contract Terms &amp; Provisions
                </label>
                <textarea
                  id={`${baseId}-terms`}
                  rows={2}
                  value={assignmentForm.contractTermsSummary}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      contractTermsSummary: e.target.value,
                    }))
                  }
                  placeholder="Airfare/mileage cap, airport pickup, youth workshop, breed limits..."
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-assignNotes`} className="block font-semibold mb-1">
                  Private Judge Notes
                </label>
                <textarea
                  id={`${baseId}-assignNotes`}
                  rows={2}
                  value={assignmentForm.notes}
                  onChange={(e) =>
                    setAssignmentForm((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--barn-border)]">
              <button
                type="button"
                onClick={closeAssignmentModal}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLock.isSubmitting}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {submitLock.isSubmitting ? 'Saving...' : 'Save Assignment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CLUB CONTACT EDITOR MODAL */}
      {clubModalOpen && (
        <div
          ref={clubDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-club-title`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeClubModal();
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSubmitClub(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={`${baseId}-club-title`} className="font-display text-xl font-semibold">
                  {clubForm.id ? 'Edit Club Contact' : 'New Show Club Contact'}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Keep show secretaries, superintendents, and venue details handy.
                </p>
              </div>
              <button
                type="button"
                onClick={closeClubModal}
                aria-label="Close club contact modal"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {clubError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium"
              >
                {clubError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-cName`} className="block font-semibold mb-1">
                  Club / Organization Name *
                </label>
                <input
                  id={`${baseId}-cName`}
                  type="text"
                  required
                  value={clubForm.clubName}
                  onChange={(e) => setClubForm((p) => ({ ...p, clubName: e.target.value }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-cSanction`} className="block font-semibold mb-1">
                  Sanctioning Body
                </label>
                <input
                  id={`${baseId}-cSanction`}
                  type="text"
                  value={clubForm.sanctioningBody}
                  onChange={(e) => setClubForm((p) => ({ ...p, sanctioningBody: e.target.value }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-cPerson`} className="block font-semibold mb-1">
                  Contact Person
                </label>
                <input
                  id={`${baseId}-cPerson`}
                  type="text"
                  value={clubForm.contactPerson}
                  onChange={(e) => setClubForm((p) => ({ ...p, contactPerson: e.target.value }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-cRole`} className="block font-semibold mb-1">
                  Role Title
                </label>
                <input
                  id={`${baseId}-cRole`}
                  type="text"
                  value={clubForm.roleTitle}
                  onChange={(e) => setClubForm((p) => ({ ...p, roleTitle: e.target.value }))}
                  placeholder="Show Secretary / Judge Chair"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-cEmail`} className="block font-semibold mb-1">
                  Email
                </label>
                <input
                  id={`${baseId}-cEmail`}
                  type="email"
                  value={clubForm.email}
                  onChange={(e) => setClubForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-cPhone`} className="block font-semibold mb-1">
                  Phone
                </label>
                <input
                  id={`${baseId}-cPhone`}
                  type="tel"
                  value={clubForm.phone}
                  onChange={(e) => setClubForm((p) => ({ ...p, phone: e.target.value }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
              <div>
                <label htmlFor={`${baseId}-cCity`} className="block font-semibold mb-1">
                  City / State
                </label>
                <input
                  id={`${baseId}-cCity`}
                  type="text"
                  value={clubForm.cityState}
                  onChange={(e) => setClubForm((p) => ({ ...p, cityState: e.target.value }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-cVenue`} className="block font-semibold mb-1">
                  Usual Venue / Fairgrounds
                </label>
                <input
                  id={`${baseId}-cVenue`}
                  type="text"
                  value={clubForm.venueName}
                  onChange={(e) => setClubForm((p) => ({ ...p, venueName: e.target.value }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-cNotes`} className="block font-semibold mb-1">
                  Notes
                </label>
                <textarea
                  id={`${baseId}-cNotes`}
                  rows={2}
                  value={clubForm.notes}
                  onChange={(e) => setClubForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--barn-border)]">
              <button
                type="button"
                onClick={closeClubModal}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLock.isSubmitting}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {submitLock.isSubmitting ? 'Saving...' : 'Save Club Contact'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EXPENSE EDITOR MODAL */}
      {expenseModalOpen && (
        <div
          ref={expenseDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${baseId}-exp-title`}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeExpenseModal();
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSubmitExpense(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={`${baseId}-exp-title`} className="font-display text-xl font-semibold">
                  {expenseForm.id ? 'Edit Judging Expense' : 'Log Judging Expense'}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  Track lodging, airfare, rental cars, meals, coats, or license fees.
                </p>
              </div>
              <button
                type="button"
                onClick={closeExpenseModal}
                aria-label="Close expense modal"
                className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {expenseError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)] text-xs font-medium"
              >
                {expenseError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-eShow`} className="block font-semibold mb-1">
                  Linked Show Assignment
                </label>
                <select
                  id={`${baseId}-eShow`}
                  value={expenseForm.assignmentId}
                  onChange={(e) =>
                    setExpenseForm((p) => ({ ...p, assignmentId: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">— General Judging Overhead (Unlinked) —</option>
                  {judgeAssignments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.showDateIso} · {a.showName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${baseId}-eDate`} className="block font-semibold mb-1">
                  Date
                </label>
                <input
                  id={`${baseId}-eDate`}
                  type="date"
                  required
                  value={expenseForm.dateIso}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, dateIso: e.target.value }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-eCat`} className="block font-semibold mb-1">
                  Category
                </label>
                <select
                  id={`${baseId}-eCat`}
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm((p) => ({
                      ...p,
                      category: e.target.value as JudgeExpenseCategory,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {JUDGE_EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-eDesc`} className="block font-semibold mb-1">
                  Description *
                </label>
                <input
                  id={`${baseId}-eDesc`}
                  type="text"
                  required
                  value={expenseForm.description}
                  onChange={(e) =>
                    setExpenseForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="2-night hotel near fairgrounds"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-eVendor`} className="block font-semibold mb-1">
                  Vendor / Carrier
                </label>
                <input
                  id={`${baseId}-eVendor`}
                  type="text"
                  value={expenseForm.vendor}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, vendor: e.target.value }))}
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>

              <div>
                <label htmlFor={`${baseId}-eAmt`} className="block font-semibold mb-1">
                  Amount ({currencyCode}) *
                </label>
                <input
                  id={`${baseId}-eAmt`}
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  value={expenseForm.amountDollars}
                  onChange={(e) =>
                    setExpenseForm((p) => ({ ...p, amountDollars: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={expenseForm.reimbursable}
                    onChange={(e) =>
                      setExpenseForm((p) => ({
                        ...p,
                        reimbursable: e.target.checked,
                        reimbursed: e.target.checked ? p.reimbursed : false,
                      }))
                    }
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Club Reimbursable</span>
                </label>

                {expenseForm.reimbursable && (
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={expenseForm.reimbursed}
                      onChange={(e) =>
                        setExpenseForm((p) => ({ ...p, reimbursed: e.target.checked }))
                      }
                      className="w-4 h-4 accent-[var(--barn-sage)]"
                    />
                    <span>Reimbursed</span>
                  </label>
                )}

                {expenseForm.reimbursable && expenseForm.reimbursed && (
                  <input
                    type="date"
                    aria-label="Reimbursed date"
                    value={expenseForm.reimbursedDateIso}
                    onChange={(e) =>
                      setExpenseForm((p) => ({ ...p, reimbursedDateIso: e.target.value }))
                    }
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                  />
                )}

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={expenseForm.taxDeductible}
                    onChange={(e) =>
                      setExpenseForm((p) => ({ ...p, taxDeductible: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[var(--barn-sage)]"
                  />
                  <span>Tax-Deductible</span>
                </label>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor={`${baseId}-eNotes`} className="block font-semibold mb-1">
                  Notes
                </label>
                <textarea
                  id={`${baseId}-eNotes`}
                  rows={2}
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--barn-border)]">
              <button
                type="button"
                onClick={closeExpenseModal}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitLock.isSubmitting}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {submitLock.isSubmitting ? 'Saving...' : 'Save Expense'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PRINTABLE CONTRACT PREVIEW */}
      {previewContractAssignment && (
        <PrintPreviewModal
          title={`Judging Agreement — ${previewContractAssignment.showName}`}
          filename={buildJudgeContractFileName(previewContractAssignment)}
          htmlContent={contractHtml}
          onClose={() => setPreviewContractAssignmentId(null)}
        />
      )}

      {/* PRINTABLE ANNUAL SUMMARY PREVIEW */}
      {printSummaryOpen && (
        <PrintPreviewModal
          title={`Judge's Notebook Summary (${summary.yearLabel})`}
          filename={`judge-notebook-summary-${speciesProfile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${summary.yearLabel.replace(/\s+/g, '-').toLowerCase()}.htm`}
          htmlContent={annualSummaryHtml}
          onClose={() => setPrintSummaryOpen(false)}
        />
      )}
    </div>
  );
}
