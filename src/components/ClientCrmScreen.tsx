/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Client CRM, Buyer Waitlist, Reservations & Deposit Reminders (`src/components/ClientCrmScreen.tsx`).
 *
 * Strictly species-isolated local-first breeder CRM powered by `src/core/clientCrm.ts`
 * and persisted offline via SQLite/IndexedDB + delta outbox sync.
 */

import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  Check,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Download,
  Edit3,
  ExternalLink,
  FileBarChart2,
  ListChecks,
  Mail,
  MapPin,
  Phone,
  Plus,
  Printer,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, useMemo, useState } from 'react';
import { evaluateAnimalActiveWithdrawal } from '../core/barnAlerts';
import {
  buildSuggestedAgreementNumber,
  CrmFollowUpReminder,
  evaluateCrmFollowUpReminders,
  evaluateReservationFinancials,
  findWaitlistMatches,
  formatClientKindLabel,
  formatClientsCsv,
  formatPreferredContactLabel,
  formatReservationsCsv,
  formatWaitlistCsv,
  generateSalesAgreementHtml,
  WaitlistMatchCandidate,
} from '../core/clientCrm';
import {
  AnimalReservation,
  BarnSettings,
  CLIENT_KINDS,
  ClientContact,
  ClientKind,
  formatCurrencyCents,
  formatReadableDate,
  isAnimalArchived,
  normalizeCurrencyCode,
  PREFERRED_CONTACT_METHODS,
  PreferredContactMethod,
  RESERVATION_STATUSES,
  ReservationStatus,
  todayDateIso,
  WAITLIST_INTENTS,
  WAITLIST_STATUSES,
  WaitlistEntry,
  WaitlistIntent,
  WaitlistStatus,
} from '../core/models';
import { ActiveSpeciesData } from '../hooks/useBarnStore';
import { useAccessibleDialog } from '../utils/useAccessibleDialog';
import { useAsyncKeyedLock, useAsyncSubmitLock } from '../utils/useAsyncSubmitLock';
import { downloadTextFile } from '../utils/webFileActions';
import { PrintPreviewModal } from './PrintPreviewModal';

export interface ClientCrmScreenProps {
  activeData: ActiveSpeciesData;
  settings: BarnSettings;
  onBackToHub: () => void;
  onOpenAnimal: (animalId: string) => void;
  onOpenReports: () => void;
  onSaveClient: (
    draft: Omit<ClientContact, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null>;
  onDeleteClient: (id: string) => Promise<void> | void;
  onSaveWaitlistEntry: (
    draft: Omit<WaitlistEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null>;
  onDeleteWaitlistEntry: (id: string) => Promise<void> | void;
  onSaveReservation: (
    draft: Omit<AnimalReservation, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<string | null>;
  onDeleteReservation: (id: string) => Promise<void> | void;
  onCompleteReservationSale: (params: {
    reservationId: string;
    completedDateIso?: string;
    markAnimalSold?: boolean;
    recordLedgerIncome?: boolean;
  }) => Promise<boolean>;
  onCreateReminderTask: (speciesName: string, reminder: CrmFollowUpReminder) => Promise<boolean>;
}

type CrmTab = 'reservations' | 'waitlist' | 'clients';
type ReservationFilter = 'all' | 'active' | 'pending_deposit' | 'paid_ready' | 'completed' | 'cancelled';
type WaitlistFilter = 'all' | 'active_matched' | 'deposited' | 'fulfilled' | 'paused_cancelled';

interface ClientFormDraft {
  id?: string;
  fullName: string;
  ranchOrHerdName: string;
  email: string;
  phone: string;
  preferredContact: PreferredContactMethod;
  clientKind: ClientKind;
  cityState: string;
  shippingAddress: string;
  tagsText: string;
  notes: string;
}

interface WaitlistFormDraft {
  id?: string;
  clientId: string;
  clientName: string;
  priorityRank: string;
  status: WaitlistStatus;
  intent: WaitlistIntent;
  desiredBreed: string;
  desiredVariety: string;
  preferredSex: 'Any' | 'Male' | 'Female';
  preferredBreedingId: string;
  requestedByDateIso: string;
  inquiryDateIso: string;
  followUpDateIso: string;
  lastContactedDateIso: string;
  maxBudget: string;
  notes: string;
}

interface ReservationFormDraft {
  id?: string;
  agreementNumber: string;
  clientId: string;
  clientName: string;
  waitlistEntryId: string;
  animalId: string;
  breedingId: string;
  pickOrder: string;
  itemLabel: string;
  status: ReservationStatus;
  reservedDateIso: string;
  holdExpiresDateIso: string;
  totalPrice: string;
  depositRequired: string;
  depositPaid: string;
  depositDueDateIso: string;
  depositPaidDateIso: string;
  pickupScheduledDateIso: string;
  balanceReminderDateIso: string;
  paymentMethod: string;
  termsSummary: string;
  healthGuaranteeNotes: string;
  notes: string;
}

function centsToInputString(cents: number | undefined): string {
  if (!cents || !Number.isFinite(cents) || cents <= 0) return '';
  return (cents / 100).toFixed(2);
}

function parseInputToCents(raw: string): number {
  const clean = raw.replace(/[^0-9.-]/g, '').trim();
  if (!clean) return 0;
  const num = Number(clean);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function buildEmptyClientDraft(): ClientFormDraft {
  return {
    fullName: '',
    ranchOrHerdName: '',
    email: '',
    phone: '',
    preferredContact: 'sms',
    clientKind: 'pet_buyer',
    cityState: '',
    shippingAddress: '',
    tagsText: '',
    notes: '',
  };
}

export function ClientCrmScreen({
  activeData,
  settings,
  onBackToHub,
  onOpenAnimal,
  onOpenReports,
  onSaveClient,
  onDeleteClient,
  onSaveWaitlistEntry,
  onDeleteWaitlistEntry,
  onSaveReservation,
  onDeleteReservation,
  onCompleteReservationSale,
  onCreateReminderTask,
}: ClientCrmScreenProps) {
  const {
    speciesProfile,
    animals,
    breedings,
    careLogs,
    herdById,
    clientContacts,
    waitlistEntries,
    animalReservations,
  } = activeData;
  const speciesName = speciesProfile.name;
  const currencyCode = normalizeCurrencyCode(settings.currencyCode, 'USD');
  const todayIso = todayDateIso();

  const [activeTab, setActiveTab] = useState<CrmTab>('reservations');
  const [searchQuery, setSearchQuery] = useState('');
  const [reservationFilter, setReservationFilter] = useState<ReservationFilter>('all');
  const [waitlistFilter, setWaitlistFilter] = useState<WaitlistFilter>('all');
  const [clientKindFilter, setClientKindFilter] = useState<'all' | ClientKind>('all');
  const [expandedMatchWaitlistId, setExpandedMatchWaitlistId] = useState<string | null>(null);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);

  // Modal state
  const [clientDraft, setClientDraft] = useState<ClientFormDraft | null>(null);
  const [waitlistDraft, setWaitlistDraft] = useState<WaitlistFormDraft | null>(null);
  const [reservationDraft, setReservationDraft] = useState<ReservationFormDraft | null>(null);
  const [paymentModalRes, setPaymentModalRes] = useState<AnimalReservation | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentDateInput, setPaymentDateInput] = useState(todayIso);
  const [paymentMethodInput, setPaymentMethodInput] = useState('');

  const [completeSaleRes, setCompleteSaleRes] = useState<AnimalReservation | null>(null);
  const [completeSaleDate, setCompleteSaleDate] = useState(todayIso);
  const [completeMarkAnimalSold, setCompleteMarkAnimalSold] = useState(true);
  const [completeRecordLedger, setCompleteRecordLedger] = useState(true);

  const [printAgreementRes, setPrintAgreementRes] = useState<AnimalReservation | null>(null);

  // Submit & action locks
  const clientSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const waitlistSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const reservationSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const paymentSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const completeSaleSubmitLock = useAsyncSubmitLock({ postSettleCooldownMs: 250 });
  const reminderActionLock = useAsyncKeyedLock();
  const quickActionLock = useAsyncKeyedLock();

  // Accessible dialogs
  const clientDialogRef = useAccessibleDialog({
    isOpen: Boolean(clientDraft),
    onClose: () => {
      if (!clientSubmitLock.isSubmitting) setClientDraft(null);
    },
  });
  const waitlistDialogRef = useAccessibleDialog({
    isOpen: Boolean(waitlistDraft),
    onClose: () => {
      if (!waitlistSubmitLock.isSubmitting) setWaitlistDraft(null);
    },
  });
  const reservationDialogRef = useAccessibleDialog({
    isOpen: Boolean(reservationDraft),
    onClose: () => {
      if (!reservationSubmitLock.isSubmitting) setReservationDraft(null);
    },
  });
  const paymentDialogRef = useAccessibleDialog({
    isOpen: Boolean(paymentModalRes),
    onClose: () => {
      if (!paymentSubmitLock.isSubmitting) setPaymentModalRes(null);
    },
  });
  const completeSaleDialogRef = useAccessibleDialog({
    isOpen: Boolean(completeSaleRes),
    onClose: () => {
      if (!completeSaleSubmitLock.isSubmitting) setCompleteSaleRes(null);
    },
  });

  const clientById = useMemo(
    () => new Map(clientContacts.map((c) => [c.id, c])),
    [clientContacts]
  );

  const crmSummary = useMemo(
    () =>
      evaluateCrmFollowUpReminders({
        clients: clientContacts,
        waitlistEntries,
        reservations: animalReservations,
        currencyCode,
        todayIso,
      }),
    [clientContacts, waitlistEntries, animalReservations, currencyCode, todayIso]
  );

  const availableAnimals = useMemo(
    () =>
      animals.filter(
        (a) => !isAnimalArchived(a) && a.status !== 'Sold' && a.status !== 'Deceased' && !a.culled
      ),
    [animals]
  );

  const activeBreedings = useMemo(
    () => breedings.filter((b) => b.status !== 'Missed' && b.status !== 'Weaned'),
    [breedings]
  );

  const queryLower = searchQuery.trim().toLowerCase();

  const filteredReservations = useMemo(() => {
    return animalReservations.filter((res) => {
      if (reservationFilter === 'active') {
        if (res.status === 'Picked Up / Completed' || res.status === 'Cancelled') return false;
      } else if (reservationFilter === 'pending_deposit') {
        if (res.status !== 'Inquiry Hold' && res.status !== 'Pending Deposit') return false;
      } else if (reservationFilter === 'paid_ready') {
        if (
          res.status !== 'Deposit Paid' &&
          res.status !== 'Paid in Full' &&
          res.status !== 'Ready for Pickup'
        ) {
          return false;
        }
      } else if (reservationFilter === 'completed') {
        if (res.status !== 'Picked Up / Completed') return false;
      } else if (reservationFilter === 'cancelled') {
        if (res.status !== 'Cancelled') return false;
      }

      if (!queryLower) return true;
      const client = clientById.get(res.clientId);
      const haystack = [
        res.agreementNumber,
        res.clientName,
        client?.fullName,
        client?.phone,
        client?.email,
        res.itemLabel,
        res.status,
        res.paymentMethod,
        res.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [animalReservations, reservationFilter, queryLower, clientById]);

  const filteredWaitlist = useMemo(() => {
    return waitlistEntries.filter((w) => {
      if (waitlistFilter === 'active_matched') {
        if (w.status !== 'Active' && w.status !== 'Matched') return false;
      } else if (waitlistFilter === 'deposited') {
        if (w.status !== 'Deposited') return false;
      } else if (waitlistFilter === 'fulfilled') {
        if (w.status !== 'Fulfilled') return false;
      } else if (waitlistFilter === 'paused_cancelled') {
        if (w.status !== 'Paused' && w.status !== 'Cancelled') return false;
      }

      if (!queryLower) return true;
      const client = clientById.get(w.clientId);
      const haystack = [
        w.clientName,
        client?.fullName,
        client?.phone,
        client?.email,
        w.desiredBreed,
        w.desiredVariety,
        w.intent,
        w.status,
        w.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [waitlistEntries, waitlistFilter, queryLower, clientById]);

  const filteredClients = useMemo(() => {
    return clientContacts.filter((c) => {
      if (clientKindFilter !== 'all' && c.clientKind !== clientKindFilter) return false;
      if (!queryLower) return true;
      const haystack = [
        c.fullName,
        c.ranchOrHerdName,
        c.email,
        c.phone,
        c.cityState,
        ...(c.tags ?? []),
        c.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(queryLower);
    });
  }, [clientContacts, clientKindFilter, queryLower]);

  const nextWaitlistRank = useMemo(() => {
    let maxRank = 0;
    for (const w of waitlistEntries) {
      if (w.priorityRank > maxRank) maxRank = w.priorityRank;
    }
    return String(maxRank + 1);
  }, [waitlistEntries]);

  const openNewClientModal = () => {
    setClientDraft(buildEmptyClientDraft());
  };

  const openEditClientModal = (c: ClientContact) => {
    setClientDraft({
      id: c.id,
      fullName: c.fullName,
      ranchOrHerdName: c.ranchOrHerdName,
      email: c.email,
      phone: c.phone,
      preferredContact: c.preferredContact,
      clientKind: c.clientKind,
      cityState: c.cityState,
      shippingAddress: c.shippingAddress,
      tagsText: (c.tags ?? []).join(', '),
      notes: c.notes,
    });
  };

  const openNewWaitlistModal = (prefillClient?: ClientContact) => {
    setWaitlistDraft({
      clientId: prefillClient?.id || '',
      clientName: prefillClient?.fullName || '',
      priorityRank: nextWaitlistRank,
      status: 'Active',
      intent: prefillClient?.clientKind === 'show_breeder'
        ? 'Show / Breeding'
        : prefillClient?.clientKind === 'youth_4h_ffa'
          ? '4-H / FFA Youth'
          : prefillClient?.clientKind === 'commercial_meat'
            ? 'Meat / Commercial'
            : 'Pet / Companion',
      desiredBreed: '',
      desiredVariety: '',
      preferredSex: 'Any',
      preferredBreedingId: '',
      requestedByDateIso: '',
      inquiryDateIso: todayIso,
      followUpDateIso: '',
      lastContactedDateIso: todayIso,
      maxBudget: '',
      notes: '',
    });
  };

  const openEditWaitlistModal = (w: WaitlistEntry) => {
    setWaitlistDraft({
      id: w.id,
      clientId: w.clientId,
      clientName: w.clientName,
      priorityRank: String(w.priorityRank || 1),
      status: w.status,
      intent: w.intent,
      desiredBreed: w.desiredBreed,
      desiredVariety: w.desiredVariety,
      preferredSex: w.preferredSex,
      preferredBreedingId: w.preferredBreedingId || '',
      requestedByDateIso: w.requestedByDateIso,
      inquiryDateIso: w.inquiryDateIso,
      followUpDateIso: w.followUpDateIso,
      lastContactedDateIso: w.lastContactedDateIso,
      maxBudget: centsToInputString(w.maxBudgetCents),
      notes: w.notes,
    });
  };

  const openNewReservationModal = (opts?: {
    client?: ClientContact;
    waitlistEntry?: WaitlistEntry;
    matchCandidate?: WaitlistMatchCandidate;
  }) => {
    const clientId = opts?.client?.id || opts?.waitlistEntry?.clientId || '';
    const clientName =
      opts?.client?.fullName ||
      opts?.waitlistEntry?.clientName ||
      (clientId ? clientById.get(clientId)?.fullName || '' : '');
    const animalId = opts?.matchCandidate?.kind === 'animal' ? opts.matchCandidate.id : '';
    const breedingId =
      opts?.matchCandidate?.kind === 'breeding'
        ? opts.matchCandidate.id
        : opts?.waitlistEntry?.preferredBreedingId || '';
    const linkedAnimal = animalId ? herdById.get(animalId) : undefined;
    const itemLabel = opts?.matchCandidate
      ? opts.matchCandidate.label
      : linkedAnimal
        ? `${linkedAnimal.name}${linkedAnimal.tattoo ? ` (#${linkedAnimal.tattoo})` : ''}`
        : opts?.waitlistEntry
          ? [
              opts.waitlistEntry.desiredBreed,
              opts.waitlistEntry.desiredVariety,
              opts.waitlistEntry.preferredSex !== 'Any' ? opts.waitlistEntry.preferredSex : '',
              'Pick',
            ]
              .filter(Boolean)
              .join(' ')
          : '';

    setReservationDraft({
      agreementNumber: buildSuggestedAgreementNumber(animalReservations),
      clientId,
      clientName,
      waitlistEntryId: opts?.waitlistEntry?.id || '',
      animalId,
      breedingId,
      pickOrder: '',
      itemLabel,
      status: 'Pending Deposit',
      reservedDateIso: todayIso,
      holdExpiresDateIso: '',
      totalPrice: opts?.waitlistEntry?.maxBudgetCents
        ? centsToInputString(opts.waitlistEntry.maxBudgetCents)
        : '',
      depositRequired: '',
      depositPaid: '',
      depositDueDateIso: '',
      depositPaidDateIso: '',
      pickupScheduledDateIso: '',
      balanceReminderDateIso: '',
      paymentMethod: '',
      termsSummary: '',
      healthGuaranteeNotes: '',
      notes: opts?.waitlistEntry?.notes || '',
    });
  };

  const openEditReservationModal = (r: AnimalReservation) => {
    setReservationDraft({
      id: r.id,
      agreementNumber: r.agreementNumber,
      clientId: r.clientId,
      clientName: r.clientName,
      waitlistEntryId: r.waitlistEntryId || '',
      animalId: r.animalId || '',
      breedingId: r.breedingId || '',
      pickOrder: r.pickOrder ? String(r.pickOrder) : '',
      itemLabel: r.itemLabel,
      status: r.status,
      reservedDateIso: r.reservedDateIso,
      holdExpiresDateIso: r.holdExpiresDateIso,
      totalPrice: centsToInputString(r.totalPriceCents),
      depositRequired: centsToInputString(r.depositRequiredCents),
      depositPaid: centsToInputString(r.depositPaidCents),
      depositDueDateIso: r.depositDueDateIso,
      depositPaidDateIso: r.depositPaidDateIso,
      pickupScheduledDateIso: r.pickupScheduledDateIso,
      balanceReminderDateIso: r.balanceReminderDateIso,
      paymentMethod: r.paymentMethod,
      termsSummary: r.termsSummary,
      healthGuaranteeNotes: r.healthGuaranteeNotes,
      notes: r.notes,
    });
  };

  const handleSaveClientForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientDraft) return;
    await clientSubmitLock.runLocked(async () => {
      const tags = clientDraft.tagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const savedId = await onSaveClient({
        id: clientDraft.id,
        species: speciesName,
        fullName: clientDraft.fullName,
        ranchOrHerdName: clientDraft.ranchOrHerdName,
        email: clientDraft.email,
        phone: clientDraft.phone,
        preferredContact: clientDraft.preferredContact,
        clientKind: clientDraft.clientKind,
        cityState: clientDraft.cityState,
        shippingAddress: clientDraft.shippingAddress,
        tags,
        notes: clientDraft.notes,
      });
      if (savedId) {
        setClientDraft(null);
      }
    });
  };

  const handleSaveWaitlistForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!waitlistDraft) return;
    await waitlistSubmitLock.runLocked(async () => {
      const maxBudgetCents = parseInputToCents(waitlistDraft.maxBudget);
      const savedId = await onSaveWaitlistEntry({
        id: waitlistDraft.id,
        species: speciesName,
        clientId: waitlistDraft.clientId,
        clientName: waitlistDraft.clientName,
        priorityRank: Math.max(1, Math.round(Number(waitlistDraft.priorityRank) || 1)),
        status: waitlistDraft.status,
        intent: waitlistDraft.intent,
        desiredBreed: waitlistDraft.desiredBreed,
        desiredVariety: waitlistDraft.desiredVariety,
        preferredSex: waitlistDraft.preferredSex,
        preferredBreedingId: waitlistDraft.preferredBreedingId || undefined,
        requestedByDateIso: waitlistDraft.requestedByDateIso,
        inquiryDateIso: waitlistDraft.inquiryDateIso || todayIso,
        followUpDateIso: waitlistDraft.followUpDateIso,
        lastContactedDateIso: waitlistDraft.lastContactedDateIso,
        maxBudgetCents: maxBudgetCents > 0 ? maxBudgetCents : undefined,
        notes: waitlistDraft.notes,
      });
      if (savedId) {
        setWaitlistDraft(null);
      }
    });
  };

  const handleSaveReservationForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!reservationDraft) return;
    await reservationSubmitLock.runLocked(async () => {
      const savedId = await onSaveReservation({
        id: reservationDraft.id,
        species: speciesName,
        agreementNumber: reservationDraft.agreementNumber,
        clientId: reservationDraft.clientId,
        clientName: reservationDraft.clientName,
        waitlistEntryId: reservationDraft.waitlistEntryId || undefined,
        animalId: reservationDraft.animalId || undefined,
        breedingId: reservationDraft.breedingId || undefined,
        pickOrder: reservationDraft.pickOrder
          ? Math.max(1, Math.round(Number(reservationDraft.pickOrder)))
          : undefined,
        itemLabel: reservationDraft.itemLabel,
        status: reservationDraft.status,
        reservedDateIso: reservationDraft.reservedDateIso || todayIso,
        holdExpiresDateIso: reservationDraft.holdExpiresDateIso,
        totalPriceCents: parseInputToCents(reservationDraft.totalPrice),
        depositRequiredCents: parseInputToCents(reservationDraft.depositRequired),
        depositPaidCents: parseInputToCents(reservationDraft.depositPaid),
        depositDueDateIso: reservationDraft.depositDueDateIso,
        depositPaidDateIso: reservationDraft.depositPaidDateIso,
        pickupScheduledDateIso: reservationDraft.pickupScheduledDateIso,
        completedDateIso:
          reservationDraft.status === 'Picked Up / Completed' ? todayIso : '',
        balanceReminderDateIso: reservationDraft.balanceReminderDateIso,
        paymentMethod: reservationDraft.paymentMethod,
        termsSummary: reservationDraft.termsSummary,
        healthGuaranteeNotes: reservationDraft.healthGuaranteeNotes,
        notes: reservationDraft.notes,
      });
      if (savedId) {
        setReservationDraft(null);
      }
    });
  };

  const openRecordPaymentModal = (res: AnimalReservation) => {
    const fin = evaluateReservationFinancials(res);
    const defaultPaymentCents =
      fin.depositRemainingCents > 0
        ? fin.depositRemainingCents
        : fin.balanceRemainingCents > 0
          ? fin.balanceRemainingCents
          : 0;
    setPaymentModalRes(res);
    setPaymentAmountInput(centsToInputString(defaultPaymentCents));
    setPaymentDateInput(todayIso);
    setPaymentMethodInput(res.paymentMethod || '');
  };

  const handleRecordPaymentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!paymentModalRes) return;
    const addCents = parseInputToCents(paymentAmountInput);
    if (addCents <= 0) return;

    await paymentSubmitLock.runLocked(async () => {
      const nextPaidCents = paymentModalRes.depositPaidCents + addCents;
      const fin = evaluateReservationFinancials({
        status: paymentModalRes.status,
        totalPriceCents: paymentModalRes.totalPriceCents,
        depositRequiredCents: paymentModalRes.depositRequiredCents,
        depositPaidCents: nextPaidCents,
      });
      const savedId = await onSaveReservation({
        ...paymentModalRes,
        depositPaidCents: nextPaidCents,
        depositPaidDateIso: paymentDateInput || todayIso,
        paymentMethod: paymentMethodInput.trim() || paymentModalRes.paymentMethod,
        status: fin.suggestedStatus,
      });
      if (savedId) {
        setPaymentModalRes(null);
      }
    });
  };

  const openCompleteSaleModal = (res: AnimalReservation) => {
    setCompleteSaleRes(res);
    setCompleteSaleDate(todayIso);
    setCompleteMarkAnimalSold(Boolean(res.animalId));
    setCompleteRecordLedger(true);
  };

  const handleCompleteSaleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!completeSaleRes) return;
    await completeSaleSubmitLock.runLocked(async () => {
      const ok = await onCompleteReservationSale({
        reservationId: completeSaleRes.id,
        completedDateIso: completeSaleDate || todayIso,
        markAnimalSold: completeMarkAnimalSold,
        recordLedgerIncome: completeRecordLedger,
      });
      if (ok) {
        setCompleteSaleRes(null);
      }
    });
  };

  const handleDeleteWithConfirm = (key: string, onConfirm: () => Promise<void> | void) => {
    if (pendingDeleteKey !== key) {
      setPendingDeleteKey(key);
      return;
    }
    setPendingDeleteKey(null);
    void quickActionLock.runKeyLocked(key, async () => {
      await onConfirm();
    });
  };

  const printAgreementHtml = useMemo(() => {
    if (!printAgreementRes) return '';
    const client = clientById.get(printAgreementRes.clientId) ?? null;
    const animal = printAgreementRes.animalId ? herdById.get(printAgreementRes.animalId) ?? null : null;
    const breeding = printAgreementRes.breedingId
      ? breedings.find((b) => b.id === printAgreementRes.breedingId) ?? null
      : null;
    const sire = animal?.sireId
      ? herdById.get(animal.sireId) ?? null
      : breeding?.sireId
        ? herdById.get(breeding.sireId) ?? null
        : null;
    const dam = animal?.damId
      ? herdById.get(animal.damId) ?? null
      : breeding?.damId
        ? herdById.get(breeding.damId) ?? null
        : null;
    const activeWithdrawal = animal
      ? evaluateAnimalActiveWithdrawal(careLogs, animal.id, { todayIso })
      : null;

    return generateSalesAgreementHtml({
      reservation: printAgreementRes,
      client,
      animal,
      breeding,
      sire,
      dam,
      settings,
      speciesProfile,
      activeWithdrawal,
      generatedDateIso: todayIso,
    });
  }, [printAgreementRes, clientById, herdById, breedings, careLogs, settings, speciesProfile, todayIso]);

  const completeSaleWithdrawal = useMemo(() => {
    if (!completeSaleRes?.animalId) return null;
    const ev = evaluateAnimalActiveWithdrawal(careLogs, completeSaleRes.animalId, { todayIso });
    return ev.isActive ? ev : null;
  }, [completeSaleRes, careLogs, todayIso]);

  const handleExportCsv = () => {
    const slug = speciesName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (activeTab === 'clients') {
      downloadTextFile(
        `${slug}-clients-${todayIso}.csv`,
        formatClientsCsv(filteredClients),
        'text/csv;charset=utf-8'
      );
      return;
    }
    if (activeTab === 'waitlist') {
      downloadTextFile(
        `${slug}-waitlist-${todayIso}.csv`,
        formatWaitlistCsv(filteredWaitlist, currencyCode),
        'text/csv;charset=utf-8'
      );
      return;
    }
    downloadTextFile(
      `${slug}-reservations-${todayIso}.csv`,
      formatReservationsCsv(filteredReservations, currencyCode),
      'text/csv;charset=utf-8'
    );
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onBackToHub}
              className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back to {speciesName}
            </button>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[11px] font-semibold text-[var(--barn-sage)]">
              {speciesName} Buyer CRM
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
            Client CRM, Waitlist &amp; Deposits
          </h1>
          <p className="text-xs text-[var(--barn-muted)]">
            Track buyer inquiries, ranked waitlist matches, animal/litter holds, deposit reminders, and printable sales agreements strictly inside {speciesName}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenReports}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <FileBarChart2 className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            CRM Reports
          </button>
          <button
            type="button"
            onClick={openNewClientModal}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            New Client
          </button>
          <button
            type="button"
            onClick={() => openNewWaitlistModal()}
            className="min-h-[40px] px-3 py-2 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <ListChecks className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            Add Waitlist
          </button>
          <button
            type="button"
            onClick={() => openNewReservationModal()}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] hover:brightness-105 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New Reservation
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <section aria-label="CRM KPI summary" className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Clients</div>
          <div className="text-xl font-bold font-mono tabular-nums">{crmSummary.totalClients}</div>
          <div className="text-[11px] text-[var(--barn-muted)]">Saved buyer profiles</div>
        </div>
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Active Waitlist</div>
          <div className="text-xl font-bold font-mono tabular-nums">{crmSummary.activeWaitlistCount}</div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {crmSummary.matchedWaitlistCount} matched to stock
          </div>
        </div>
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Reservations</div>
          <div className="text-xl font-bold font-mono tabular-nums">{crmSummary.activeReservationsCount}</div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {crmSummary.completedReservationsCount} completed
          </div>
        </div>
        <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Collected Deposits</div>
          <div className="text-xl font-bold font-mono tabular-nums text-[var(--barn-sage)]">
            {formatCurrencyCents(crmSummary.collectedDepositsCents, currencyCode)}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            of {formatCurrencyCents(crmSummary.reservedRevenueCents, currencyCode)} reserved
          </div>
        </div>
        <div className="col-span-2 lg:col-span-1 bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-1">
          <div className="text-[11px] font-medium text-[var(--barn-muted)]">Balances Due</div>
          <div className="text-xl font-bold font-mono tabular-nums">
            {formatCurrencyCents(crmSummary.outstandingBalancesCents, currencyCode)}
          </div>
          <div className="text-[11px] text-[var(--barn-muted)]">
            {formatCurrencyCents(crmSummary.outstandingDepositsCents, currencyCode)} deposits pending
          </div>
        </div>
      </section>

      {/* Automated Deposit, Hold & Waitlist Follow-Up Reminders */}
      {crmSummary.reminders.length > 0 && (
        <section
          aria-label="CRM Follow-Up and Deposit Reminders"
          className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-[var(--barn-terracotta)]" aria-hidden="true" />
              <h2 className="text-sm font-semibold">
                Follow-Up &amp; Deposit Reminders ({crmSummary.reminders.length})
              </h2>
              {crmSummary.overdueReminderCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[var(--barn-terracotta-tint)] border border-[var(--barn-terracotta)]/50 text-[11px] font-semibold text-[var(--barn-terracotta)]">
                  {crmSummary.overdueReminderCount} overdue
                </span>
              )}
              {crmSummary.dueSoonReminderCount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 text-[11px] font-semibold text-[var(--barn-sage)]">
                  {crmSummary.dueSoonReminderCount} due now
                </span>
              )}
            </div>
            <span className="text-[11px] text-[var(--barn-muted)]">
              Auto-evaluated from deposit due dates, temporary holds, pickups, and waitlist check-ins
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {crmSummary.reminders.map((rem) => {
              const targetReservation =
                rem.entityType === 'reservation'
                  ? animalReservations.find((r) => r.id === rem.entityId)
                  : undefined;
              const targetWaitlist =
                rem.entityType === 'waitlist'
                  ? waitlistEntries.find((w) => w.id === rem.entityId)
                  : undefined;
              const isBusyTask = reminderActionLock.isKeyLocked(rem.id);

              return (
                <div
                  key={rem.id}
                  className={`rounded-xl border p-3 flex flex-col justify-between gap-2.5 ${
                    rem.urgency === 'overdue'
                      ? 'bg-[var(--barn-terracotta-tint)]/70 border-[var(--barn-terracotta)]/60'
                      : rem.urgency === 'due_soon'
                        ? 'bg-[var(--barn-sage-tint)]/70 border-[var(--barn-sage)]/50'
                        : 'bg-[var(--barn-canvas)] border-[var(--barn-border)]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-[var(--barn-ink)]">
                        {rem.title}
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-[var(--barn-muted)] shrink-0">
                        {formatReadableDate(rem.targetDateIso)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--barn-muted)]">{rem.detail}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusyTask}
                      onClick={() =>
                        void reminderActionLock.runKeyLocked(rem.id, () =>
                          onCreateReminderTask(speciesName, rem)
                        )
                      }
                      className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      <ClipboardList className="w-3 h-3 text-[var(--barn-sage)]" aria-hidden="true" />
                      {isBusyTask ? 'Adding...' : 'Add Barn Task'}
                    </button>

                    {targetReservation &&
                      (rem.kind === 'deposit_overdue' ||
                        rem.kind === 'deposit_due_soon' ||
                        rem.kind === 'balance_due' ||
                        rem.kind === 'hold_expiring') && (
                        <button
                          type="button"
                          onClick={() => openRecordPaymentModal(targetReservation)}
                          className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold inline-flex items-center gap-1"
                        >
                          <DollarSign className="w-3 h-3" aria-hidden="true" />
                          Record Payment
                        </button>
                      )}

                    {targetWaitlist && (
                      <button
                        type="button"
                        disabled={quickActionLock.isKeyLocked(`contacted-${targetWaitlist.id}`)}
                        onClick={() =>
                          void quickActionLock.runKeyLocked(`contacted-${targetWaitlist.id}`, async () => {
                            await onSaveWaitlistEntry({
                              ...targetWaitlist,
                              lastContactedDateIso: todayIso,
                            });
                          })
                        }
                        className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Check className="w-3 h-3 text-[var(--barn-sage)]" aria-hidden="true" />
                        Contacted Today
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Workspace Navigation Tabs & Filters */}
      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--barn-border)] pb-3">
          <div role="tablist" aria-label="CRM Workspace Tabs" className="flex flex-wrap gap-2">
            {(
              [
                {
                  id: 'reservations',
                  label: `Reservations & Deposits (${animalReservations.length})`,
                },
                {
                  id: 'waitlist',
                  label: `Buyer Waitlist (${waitlistEntries.length})`,
                },
                {
                  id: 'clients',
                  label: `Client Directory (${clientContacts.length})`,
                },
              ] as const
            ).map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setPendingDeleteKey(null);
                  }}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    selected
                      ? 'bg-[var(--barn-sage)] text-[var(--barn-on-sage)]'
                      : 'border border-[var(--barn-border)] bg-[var(--barn-canvas)] text-[var(--barn-muted)] hover:text-[var(--barn-ink)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
            Export {activeTab === 'clients' ? 'Clients' : activeTab === 'waitlist' ? 'Waitlist' : 'Reservations'} (.CSV)
          </button>
        </div>

        {/* Search & Tab Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="w-4 h-4 text-[var(--barn-muted)] absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab} by buyer, animal, breed, or notes...`}
              aria-label="Search CRM records"
              className="w-full min-h-[38px] pl-9 pr-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs"
            />
          </div>

          {activeTab === 'reservations' && (
            <select
              aria-label="Filter reservations by status"
              value={reservationFilter}
              onChange={(e) => setReservationFilter(e.target.value as ReservationFilter)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value="all">All Reservations</option>
              <option value="active">Active Holds &amp; Deposits</option>
              <option value="pending_deposit">Pending Deposit / Hold</option>
              <option value="paid_ready">Deposited / Paid / Ready</option>
              <option value="completed">Picked Up / Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          )}

          {activeTab === 'waitlist' && (
            <select
              aria-label="Filter waitlist by status"
              value={waitlistFilter}
              onChange={(e) => setWaitlistFilter(e.target.value as WaitlistFilter)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value="all">All Waitlist Entries</option>
              <option value="active_matched">Active &amp; Matched</option>
              <option value="deposited">Deposited</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="paused_cancelled">Paused / Cancelled</option>
            </select>
          )}

          {activeTab === 'clients' && (
            <select
              aria-label="Filter clients by type"
              value={clientKindFilter}
              onChange={(e) => setClientKindFilter(e.target.value as 'all' | ClientKind)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] text-xs font-medium"
            >
              <option value="all">All Client Types</option>
              {CLIENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* TAB 1: RESERVATIONS & DEPOSITS */}
        {activeTab === 'reservations' && (
          <div className="space-y-3">
            {filteredReservations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-8 text-center space-y-2">
                <p className="text-sm font-medium">No reservations match the current filter.</p>
                <p className="text-xs text-[var(--barn-muted)]">
                  Create a reservation for an animal or upcoming litter pick to track deposits, pickup dates, and printable sales agreements.
                </p>
                <button
                  type="button"
                  onClick={() => openNewReservationModal()}
                  className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Create First Reservation
                </button>
              </div>
            ) : (
              filteredReservations.map((res) => {
                const fin = evaluateReservationFinancials(res);
                const client = clientById.get(res.clientId);
                const linkedAnimal = res.animalId ? herdById.get(res.animalId) : undefined;
                const deleteKey = `res-${res.id}`;
                const isTerminal =
                  res.status === 'Picked Up / Completed' || res.status === 'Cancelled';

                return (
                  <article
                    key={res.id}
                    className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] font-mono text-[11px] font-bold">
                            {res.agreementNumber || 'RES'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                              res.status === 'Picked Up / Completed' || res.status === 'Paid in Full'
                                ? 'bg-[var(--barn-sage-tint)] border-[var(--barn-sage)]/50 text-[var(--barn-sage)]'
                                : res.status === 'Cancelled'
                                  ? 'bg-[var(--barn-subtle)] border-[var(--barn-border)] text-[var(--barn-muted)]'
                                  : 'bg-[var(--barn-surface)] border-[var(--barn-border)] text-[var(--barn-ink)]'
                            }`}
                          >
                            {res.status}
                          </span>
                          <h3 className="text-sm font-semibold text-[var(--barn-ink)]">
                            {res.itemLabel}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--barn-muted)]">
                          <span>
                            Buyer: <strong className="text-[var(--barn-ink)]">{client?.fullName || res.clientName}</strong>
                          </span>
                          {client?.phone && <span>{client.phone}</span>}
                          <span>Reserved {formatReadableDate(res.reservedDateIso)}</span>
                          {res.pickupScheduledDateIso && (
                            <span>Pickup: {formatReadableDate(res.pickupScheduledDateIso)}</span>
                          )}
                          {res.holdExpiresDateIso && !fin.isDepositSatisfied && (
                            <span>Hold expires: {formatReadableDate(res.holdExpiresDateIso)}</span>
                          )}
                          {linkedAnimal && (
                            <button
                              type="button"
                              onClick={() => onOpenAnimal(linkedAnimal.id)}
                              className="inline-flex items-center gap-1 text-[var(--barn-sage)] hover:underline font-medium"
                            >
                              {linkedAnimal.name}
                              <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums space-y-0.5">
                        <div className="text-sm font-bold">
                          {formatCurrencyCents(fin.totalPriceCents, currencyCode)}
                        </div>
                        <div className="text-[11px] text-[var(--barn-muted)]">
                          Paid {formatCurrencyCents(fin.depositPaidCents, currencyCode)} · Bal{' '}
                          <strong className="text-[var(--barn-ink)]">
                            {formatCurrencyCents(fin.balanceRemainingCents, currencyCode)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Deposit & Balance Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-[var(--barn-muted)]">
                        <span>
                          Deposit {formatCurrencyCents(fin.depositPaidCents, currencyCode)} /{' '}
                          {formatCurrencyCents(fin.depositRequiredCents, currencyCode)} required (
                          {fin.depositCoveragePercent}%)
                        </span>
                        <span>{fin.totalPaidPercent}% of total price paid</span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--barn-surface)] border border-[var(--barn-border)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--barn-sage)] transition-all"
                          style={{ width: `${fin.totalPaidPercent}%` }}
                        />
                      </div>
                    </div>

                    {res.notes && (
                      <p className="text-xs text-[var(--barn-muted)] bg-[var(--barn-surface)] rounded-lg px-3 py-2 border border-[var(--barn-border)]/70">
                        {res.notes}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {!isTerminal && (
                          <button
                            type="button"
                            onClick={() => openRecordPaymentModal(res)}
                            className="min-h-[34px] px-3 py-1 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1"
                          >
                            <DollarSign className="w-3.5 h-3.5" aria-hidden="true" />
                            Record Payment
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPrintAgreementRes(res)}
                          className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                          Sales Agreement
                        </button>
                        {!isTerminal && (
                          <button
                            type="button"
                            onClick={() => openCompleteSaleModal(res)}
                            className="min-h-[34px] px-3 py-1 rounded-xl border border-[var(--barn-sage)]/60 bg-[var(--barn-sage-tint)] hover:brightness-105 text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                            Complete Sale
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditReservationModal(res)}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteWithConfirm(deleteKey, () => onDeleteReservation(res.id))
                          }
                          className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1 ${
                            pendingDeleteKey === deleteKey
                              ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] font-semibold'
                              : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)]'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {pendingDeleteKey === deleteKey ? 'Confirm Delete' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: BUYER WAITLIST */}
        {activeTab === 'waitlist' && (
          <div className="space-y-3">
            {filteredWaitlist.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-8 text-center space-y-2">
                <p className="text-sm font-medium">No waitlist inquiries match the current filter.</p>
                <p className="text-xs text-[var(--barn-muted)]">
                  Track ranked buyer requests by breed, variety, sex, and target pairing — then match available stock in one click.
                </p>
                <button
                  type="button"
                  onClick={() => openNewWaitlistModal()}
                  className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add First Waitlist Inquiry
                </button>
              </div>
            ) : (
              filteredWaitlist.map((entry) => {
                const client = clientById.get(entry.clientId);
                const deleteKey = `wait-${entry.id}`;
                const isMatchExpanded = expandedMatchWaitlistId === entry.id;
                const matches = isMatchExpanded
                  ? findWaitlistMatches(entry, animals, breedings, animalReservations)
                  : [];

                return (
                  <article
                    key={entry.id}
                    className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/40 font-mono text-[11px] font-bold text-[var(--barn-sage)]">
                            Queue #{entry.priorityRank}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] font-semibold">
                            {entry.status}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] text-[var(--barn-muted)]">
                            {entry.intent}
                          </span>
                          <h3 className="text-sm font-semibold text-[var(--barn-ink)]">
                            {client?.fullName || entry.clientName}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--barn-muted)]">
                          <span>
                            Seeking:{' '}
                            <strong className="text-[var(--barn-ink)]">
                              {[
                                entry.desiredBreed || 'Any breed',
                                entry.desiredVariety,
                                entry.preferredSex !== 'Any' ? entry.preferredSex : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </strong>
                          </span>
                          <span>Inquired {formatReadableDate(entry.inquiryDateIso)}</span>
                          {entry.followUpDateIso && (
                            <span>Follow-up: {formatReadableDate(entry.followUpDateIso)}</span>
                          )}
                          {entry.maxBudgetCents && entry.maxBudgetCents > 0 && (
                            <span>
                              Budget: {formatCurrencyCents(entry.maxBudgetCents, currencyCode)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedMatchWaitlistId(isMatchExpanded ? null : entry.id)
                          }
                          className="min-h-[34px] px-3 py-1 rounded-xl bg-[var(--barn-sage-tint)] border border-[var(--barn-sage)]/50 hover:brightness-105 text-xs font-semibold text-[var(--barn-ink)] inline-flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[var(--barn-sage)]" aria-hidden="true" />
                          {isMatchExpanded ? 'Hide Matches' : 'Match Stock'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openNewReservationModal({ client, waitlistEntry: entry })}
                          className="min-h-[34px] px-3 py-1 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1"
                        >
                          Reserve
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditWaitlistModal(entry)}
                          className="min-h-[34px] px-2.5 py-1 rounded-xl border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-xs font-medium inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteWithConfirm(deleteKey, () => onDeleteWaitlistEntry(entry.id))
                          }
                          className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-xs font-medium inline-flex items-center gap-1 ${
                            pendingDeleteKey === deleteKey
                              ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] font-semibold'
                              : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)]'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {pendingDeleteKey === deleteKey ? 'Confirm Delete' : 'Delete'}
                        </button>
                      </div>
                    </div>

                    {entry.notes && (
                      <p className="text-xs text-[var(--barn-muted)] bg-[var(--barn-surface)] rounded-lg px-3 py-2 border border-[var(--barn-border)]/70">
                        {entry.notes}
                      </p>
                    )}

                    {isMatchExpanded && (
                      <div className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-xl p-3 space-y-2">
                        <div className="text-xs font-semibold">
                          Unreserved Herd &amp; Pairing Matches ({matches.length})
                        </div>
                        {matches.length === 0 ? (
                          <p className="text-xs text-[var(--barn-muted)]">
                            No unreserved animals or active breedings matched these criteria yet.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {matches.map((m) => (
                              <div
                                key={`${m.kind}-${m.id}`}
                                className="rounded-lg border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-2.5 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold truncate">
                                    {m.kind === 'animal' ? 'Animal: ' : 'Litter: '}
                                    {m.label}
                                  </div>
                                  <div className="text-[11px] text-[var(--barn-muted)] truncate">
                                    {m.sublabel} · {m.reasons.join(' · ')}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openNewReservationModal({
                                      client,
                                      waitlistEntry: entry,
                                      matchCandidate: m,
                                    })
                                  }
                                  className="min-h-[30px] px-2.5 py-1 rounded-lg bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-[11px] font-semibold shrink-0"
                                >
                                  Promote to Hold
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: CLIENT DIRECTORY */}
        {activeTab === 'clients' && (
          <div className="space-y-3">
            {filteredClients.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--barn-border)] p-8 text-center space-y-2">
                <p className="text-sm font-medium">No buyer contacts match the current filter.</p>
                <p className="text-xs text-[var(--barn-muted)]">
                  Save repeat show homes, 4-H/FFA families, homestead buyers, and preferred contact details here.
                </p>
                <button
                  type="button"
                  onClick={openNewClientModal}
                  className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  Add First Client
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredClients.map((client) => {
                  const resCount = animalReservations.filter((r) => r.clientId === client.id).length;
                  const waitCount = waitlistEntries.filter((w) => w.clientId === client.id).length;
                  const deleteKey = `cli-${client.id}`;

                  return (
                    <article
                      key={client.id}
                      className="rounded-xl border border-[var(--barn-border)] bg-[var(--barn-canvas)] p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold truncate">{client.fullName}</h3>
                            {client.ranchOrHerdName && (
                              <div className="text-xs text-[var(--barn-muted)] truncate">
                                {client.ranchOrHerdName}
                              </div>
                            )}
                          </div>
                          <span className="px-2 py-0.5 rounded-md bg-[var(--barn-surface)] border border-[var(--barn-border)] text-[11px] font-medium shrink-0">
                            {formatClientKindLabel(client.clientKind)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--barn-muted)]">
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" aria-hidden="true" />
                            Prefers {formatPreferredContactLabel(client.preferredContact)}
                          </span>
                          {client.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                              {client.phone}
                            </span>
                          )}
                          {client.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                              {client.email}
                            </span>
                          )}
                          {client.cityState && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                              {client.cityState}
                            </span>
                          )}
                        </div>

                        {client.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {client.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-md bg-[var(--barn-sage-tint)] text-[11px] font-medium text-[var(--barn-sage)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {client.notes && (
                          <p className="text-xs text-[var(--barn-muted)]">{client.notes}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--barn-border)]/70">
                        <span className="text-[11px] text-[var(--barn-muted)] font-mono tabular-nums">
                          {resCount} reservation{resCount === 1 ? '' : 's'} · {waitCount} waitlist
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openNewWaitlistModal(client)}
                            className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold"
                          >
                            + Waitlist
                          </button>
                          <button
                            type="button"
                            onClick={() => openNewReservationModal({ client })}
                            className="min-h-[30px] px-2.5 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px] font-semibold"
                          >
                            + Reserve
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditClientModal(client)}
                            aria-label={`Edit ${client.fullName}`}
                            className="min-h-[30px] px-2 py-1 rounded-lg border border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[11px]"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteWithConfirm(deleteKey, () => onDeleteClient(client.id))
                            }
                            className={`min-h-[30px] px-2 py-1 rounded-lg border text-[11px] ${
                              pendingDeleteKey === deleteKey
                                ? 'border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] text-[var(--barn-terracotta)] font-semibold'
                                : 'border-[var(--barn-border)] bg-[var(--barn-surface)] hover:bg-[var(--barn-subtle)] text-[var(--barn-muted)]'
                            }`}
                          >
                            {pendingDeleteKey === deleteKey ? 'Confirm' : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* CLIENT MODAL */}
      {clientDraft && (
        <div
          ref={clientDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-client-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !clientSubmitLock.isSubmitting) setClientDraft(null);
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSaveClientForm(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="crm-client-modal-title" className="font-display text-lg font-semibold">
                {clientDraft.id ? 'Edit Client Contact' : 'New Client Contact'}
              </h2>
              <button
                type="button"
                onClick={() => setClientDraft(null)}
                aria-label="Close client modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Full Name *</span>
                <input
                  type="text"
                  required
                  value={clientDraft.fullName}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, fullName: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Ranch / Herd Name</span>
                <input
                  type="text"
                  value={clientDraft.ranchOrHerdName}
                  onChange={(e) =>
                    setClientDraft((prev) =>
                      prev ? { ...prev, ranchOrHerdName: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Client Type</span>
                <select
                  value={clientDraft.clientKind}
                  onChange={(e) =>
                    setClientDraft((prev) =>
                      prev ? { ...prev, clientKind: e.target.value as ClientKind } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {CLIENT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Phone</span>
                <input
                  type="tel"
                  value={clientDraft.phone}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, phone: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Email</span>
                <input
                  type="email"
                  value={clientDraft.email}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, email: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Preferred Contact</span>
                <select
                  value={clientDraft.preferredContact}
                  onChange={(e) =>
                    setClientDraft((prev) =>
                      prev
                        ? { ...prev, preferredContact: e.target.value as PreferredContactMethod }
                        : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {PREFERRED_CONTACT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">City / State</span>
                <input
                  type="text"
                  value={clientDraft.cityState}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, cityState: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Pickup / Shipping Address</span>
                <input
                  type="text"
                  value={clientDraft.shippingAddress}
                  onChange={(e) =>
                    setClientDraft((prev) =>
                      prev ? { ...prev, shippingAddress: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Tags (comma-separated)</span>
                <input
                  type="text"
                  placeholder="Repeat buyer, Show home, Transport"
                  value={clientDraft.tagsText}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, tagsText: e.target.value } : prev))
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Notes</span>
                <textarea
                  rows={2}
                  value={clientDraft.notes}
                  onChange={(e) =>
                    setClientDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClientDraft(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={clientSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {clientSubmitLock.isSubmitting ? 'Saving...' : 'Save Client'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WAITLIST MODAL */}
      {waitlistDraft && (
        <div
          ref={waitlistDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-waitlist-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !waitlistSubmitLock.isSubmitting) {
              setWaitlistDraft(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSaveWaitlistForm(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="crm-waitlist-modal-title" className="font-display text-lg font-semibold">
                {waitlistDraft.id ? 'Edit Waitlist Inquiry' : 'New Buyer Waitlist Inquiry'}
              </h2>
              <button
                type="button"
                onClick={() => setWaitlistDraft(null)}
                aria-label="Close waitlist modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-semibold">Saved Client</span>
                <select
                  value={waitlistDraft.clientId}
                  onChange={(e) => {
                    const selected = clientById.get(e.target.value);
                    setWaitlistDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            clientId: e.target.value,
                            clientName: selected?.fullName || prev.clientName,
                          }
                        : prev
                    );
                  }}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Enter name directly --</option>
                  {clientContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Buyer Name *</span>
                <input
                  type="text"
                  required
                  value={waitlistDraft.clientName}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, clientName: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Queue Rank</span>
                <input
                  type="number"
                  min={1}
                  value={waitlistDraft.priorityRank}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, priorityRank: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Status</span>
                <select
                  value={waitlistDraft.status}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, status: e.target.value as WaitlistStatus } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {WAITLIST_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Buyer Intent</span>
                <select
                  value={waitlistDraft.intent}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, intent: e.target.value as WaitlistIntent } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {WAITLIST_INTENTS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Preferred Sex</span>
                <select
                  value={waitlistDraft.preferredSex}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev
                        ? { ...prev, preferredSex: e.target.value as 'Any' | 'Male' | 'Female' }
                        : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="Any">Any Sex</option>
                  <option value="Male">{speciesProfile.maleLabel} (Male)</option>
                  <option value="Female">{speciesProfile.femaleLabel} (Female)</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Desired Breed</span>
                <input
                  type="text"
                  value={waitlistDraft.desiredBreed}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, desiredBreed: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Desired Variety / Color</span>
                <input
                  type="text"
                  value={waitlistDraft.desiredVariety}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, desiredVariety: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Preferred Pairing / Litter</span>
                <select
                  value={waitlistDraft.preferredBreedingId}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, preferredBreedingId: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Any pairing --</option>
                  {activeBreedings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.sireName || 'Sire'} × {b.damName || 'Dam'} ({b.status})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Inquiry Date</span>
                <input
                  type="date"
                  value={waitlistDraft.inquiryDateIso}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, inquiryDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Follow-Up Reminder Date</span>
                <input
                  type="date"
                  value={waitlistDraft.followUpDateIso}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, followUpDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Needed By Date</span>
                <input
                  type="date"
                  value={waitlistDraft.requestedByDateIso}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, requestedByDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Max Budget ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={waitlistDraft.maxBudget}
                  onChange={(e) =>
                    setWaitlistDraft((prev) =>
                      prev ? { ...prev, maxBudget: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Notes</span>
                <textarea
                  rows={2}
                  value={waitlistDraft.notes}
                  onChange={(e) =>
                    setWaitlistDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWaitlistDraft(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={waitlistSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {waitlistSubmitLock.isSubmitting ? 'Saving...' : 'Save Waitlist'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RESERVATION MODAL */}
      {reservationDraft && (
        <div
          ref={reservationDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-reservation-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !reservationSubmitLock.isSubmitting) {
              setReservationDraft(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleSaveReservationForm(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="crm-reservation-modal-title" className="font-display text-lg font-semibold">
                {reservationDraft.id ? 'Edit Reservation & Deposit' : 'New Animal / Litter Reservation'}
              </h2>
              <button
                type="button"
                onClick={() => setReservationDraft(null)}
                aria-label="Close reservation modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="space-y-1">
                <span className="font-semibold">Agreement #</span>
                <input
                  type="text"
                  value={reservationDraft.agreementNumber}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, agreementNumber: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Status</span>
                <select
                  value={reservationDraft.status}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, status: e.target.value as ReservationStatus } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  {RESERVATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Saved Client</span>
                <select
                  value={reservationDraft.clientId}
                  onChange={(e) => {
                    const selected = clientById.get(e.target.value);
                    setReservationDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            clientId: e.target.value,
                            clientName: selected?.fullName || prev.clientName,
                          }
                        : prev
                    );
                  }}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Enter buyer name directly --</option>
                  {clientContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Buyer Name *</span>
                <input
                  type="text"
                  required
                  value={reservationDraft.clientName}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, clientName: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Linked Animal</span>
                <select
                  value={reservationDraft.animalId}
                  onChange={(e) => {
                    const linked = herdById.get(e.target.value);
                    setReservationDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            animalId: e.target.value,
                            itemLabel:
                              linked && !prev.itemLabel
                                ? `${linked.name}${linked.tattoo ? ` (#${linked.tattoo})` : ''}`
                                : prev.itemLabel,
                          }
                        : prev
                    );
                  }}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Optional specific animal --</option>
                  {availableAnimals.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} {a.tattoo ? `(#${a.tattoo})` : ''} · {a.sex}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Linked Pairing / Litter</span>
                <select
                  value={reservationDraft.breedingId}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, breedingId: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                >
                  <option value="">-- Optional litter pick pairing --</option>
                  {breedings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.sireName || 'Sire'} × {b.damName || 'Dam'} ({b.status})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Reserved Animal / Litter Pick Description *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Black Doe #B14 or 1st Pick Buck from Fall Litter"
                  value={reservationDraft.itemLabel}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, itemLabel: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Total Price ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={reservationDraft.totalPrice}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, totalPrice: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Deposit Required ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={reservationDraft.depositRequired}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, depositRequired: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Deposit / Payments Paid ({currencyCode})</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={reservationDraft.depositPaid}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, depositPaid: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Payment Method</span>
                <input
                  type="text"
                  placeholder="Cash, Venmo, Zelle, Check..."
                  value={reservationDraft.paymentMethod}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, paymentMethod: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Deposit Due Date</span>
                <input
                  type="date"
                  value={reservationDraft.depositDueDateIso}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, depositDueDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Hold Expires Date</span>
                <input
                  type="date"
                  value={reservationDraft.holdExpiresDateIso}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, holdExpiresDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Balance Reminder Date</span>
                <input
                  type="date"
                  value={reservationDraft.balanceReminderDateIso}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, balanceReminderDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1">
                <span className="font-semibold">Scheduled Pickup Date</span>
                <input
                  type="date"
                  value={reservationDraft.pickupScheduledDateIso}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, pickupScheduledDateIso: e.target.value } : prev
                    )
                  }
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Custom Deposit Terms (Optional)</span>
                <textarea
                  rows={2}
                  placeholder="Leave blank for standard non-refundable deposit & pedigree transfer clause."
                  value={reservationDraft.termsSummary}
                  onChange={(e) =>
                    setReservationDraft((prev) =>
                      prev ? { ...prev, termsSummary: e.target.value } : prev
                    )
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="font-semibold">Notes</span>
                <textarea
                  rows={2}
                  value={reservationDraft.notes}
                  onChange={(e) =>
                    setReservationDraft((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReservationDraft(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reservationSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {reservationSubmitLock.isSubmitting ? 'Saving...' : 'Save Reservation'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentModalRes && (
        <div
          ref={paymentDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-payment-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !paymentSubmitLock.isSubmitting) {
              setPaymentModalRes(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleRecordPaymentSubmit(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-md p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="crm-payment-modal-title" className="font-display text-lg font-semibold">
                  Record Payment — {paymentModalRes.agreementNumber}
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  {paymentModalRes.clientName} · {paymentModalRes.itemLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalRes(null)}
                aria-label="Close payment modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-semibold">Payment Received ({currencyCode}) *</span>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  required
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Payment Date</span>
                <input
                  type="date"
                  value={paymentDateInput}
                  onChange={(e) => setPaymentDateInput(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold">Payment Method</span>
                <input
                  type="text"
                  placeholder="Venmo, Zelle, Cash, Check..."
                  value={paymentMethodInput}
                  onChange={(e) => setPaymentMethodInput(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentModalRes(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={paymentSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {paymentSubmitLock.isSubmitting ? 'Saving...' : 'Apply Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* COMPLETE SALE MODAL */}
      {completeSaleRes && (
        <div
          ref={completeSaleDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-complete-sale-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !completeSaleSubmitLock.isSubmitting) {
              setCompleteSaleRes(null);
            }
          }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={(e) => void handleCompleteSaleSubmit(e)}
            className="bg-[var(--barn-surface)] border border-[var(--barn-border)] rounded-2xl w-full max-w-md p-5 space-y-4 focus:outline-none"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="crm-complete-sale-title" className="font-display text-lg font-semibold">
                  Complete Handoff &amp; Sale
                </h2>
                <p className="text-xs text-[var(--barn-muted)]">
                  {completeSaleRes.agreementNumber} · {completeSaleRes.clientName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompleteSaleRes(null)}
                aria-label="Close complete sale modal"
                className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-[var(--barn-subtle)] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {completeSaleWithdrawal && (
              <div className="rounded-xl border border-[var(--barn-terracotta)] bg-[var(--barn-terracotta-tint)] p-3 text-xs flex items-start gap-2">
                <AlertTriangle
                  className="w-4 h-4 text-[var(--barn-terracotta)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <div className="font-semibold">Active Medication Withdrawal</div>
                  <div className="text-[11px] text-[var(--barn-muted)]">
                    {completeSaleWithdrawal.medicationSummary} clears{' '}
                    {formatReadableDate(completeSaleWithdrawal.clearDateIso)}. Ensure buyer receives disclosure on the printable Sales Agreement.
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="font-semibold">Pickup / Completion Date</span>
                <input
                  type="date"
                  value={completeSaleDate}
                  onChange={(e) => setCompleteSaleDate(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-[var(--barn-canvas)] border border-[var(--barn-border)]"
                />
              </label>

              {completeSaleRes.animalId && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={completeMarkAnimalSold}
                    onChange={(e) => setCompleteMarkAnimalSold(e.target.checked)}
                    className="rounded border-[var(--barn-border)]"
                  />
                  <span>Mark linked animal status as Sold &amp; record buyer</span>
                </label>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={completeRecordLedger}
                  onChange={(e) => setCompleteRecordLedger(e.target.checked)}
                  className="rounded border-[var(--barn-border)]"
                />
                <span>
                  Record {formatCurrencyCents(Math.max(completeSaleRes.totalPriceCents, completeSaleRes.depositPaidCents), currencyCode)} income entry in Economics Ledger
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompleteSaleRes(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl border border-[var(--barn-border)] text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={completeSaleSubmitLock.isSubmitting}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-[var(--barn-sage)] text-[var(--barn-on-sage)] text-xs font-semibold disabled:opacity-60"
              >
                {completeSaleSubmitLock.isSubmitting ? 'Completing...' : 'Complete Sale'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SALES AGREEMENT PRINT PREVIEW MODAL */}
      {printAgreementRes && (
        <PrintPreviewModal
          title={`Sales Agreement — ${printAgreementRes.agreementNumber || printAgreementRes.clientName}`}
          filename={`${(printAgreementRes.agreementNumber || 'sales-agreement').toLowerCase()}.htm`}
          htmlContent={printAgreementHtml}
          onClose={() => setPrintAgreementRes(null)}
        />
      )}
    </div>
  );
}
