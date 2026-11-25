import { describe, expect, it } from 'vitest';
import {
  buildSuggestedAgreementNumber,
  evaluateCrmFollowUpReminders,
  evaluateReservationFinancials,
  findWaitlistMatches,
  formatClientsCsv,
  formatReservationsCsv,
  formatWaitlistCsv,
  generateSalesAgreementHtml,
} from '../clientCrm';
import { Animal, AnimalReservation, BarnSettings, BreedingRecord, ClientContact, WaitlistEntry } from '../models';

const TS = '2026-06-01T12:00:00.000Z';

function makeClient(overrides: Partial<ClientContact> = {}): ClientContact {
  return {
    id: 'cli-1',
    species: 'Rabbit',
    fullName: 'Alice Walker',
    ranchOrHerdName: 'Walker Rabbitry',
    email: 'client@example.com',
    phone: '555-0101',
    preferredContact: 'sms',
    clientKind: 'show_breeder',
    cityState: 'Ames, IA',
    shippingAddress: '',
    tags: ['repeat-buyer', 'holland-lop'],
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeWaitlist(overrides: Partial<WaitlistEntry> = {}): WaitlistEntry {
  return {
    id: 'wl-1',
    species: 'Rabbit',
    clientId: 'cli-1',
    clientName: 'Alice Walker',
    priorityRank: 1,
    status: 'Active',
    intent: 'Show / Breeding',
    desiredBreed: 'Holland Lop',
    desiredVariety: 'Broken Tort',
    preferredSex: 'Female',
    requestedByDateIso: '2026-08-01',
    inquiryDateIso: '2026-05-15',
    followUpDateIso: '2026-06-03',
    lastContactedDateIso: '2026-05-15',
    maxBudgetCents: 20000,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

function makeReservation(overrides: Partial<AnimalReservation> = {}): AnimalReservation {
  return {
    id: 'res-1',
    species: 'Rabbit',
    agreementNumber: 'SA-0001',
    clientId: 'cli-1',
    clientName: 'Alice Walker',
    itemLabel: 'Maple — Broken Tort Doe',
    status: 'Pending Deposit',
    reservedDateIso: '2026-06-01',
    holdExpiresDateIso: '2026-06-04',
    totalPriceCents: 15000,
    depositRequiredCents: 5000,
    depositPaidCents: 0,
    depositDueDateIso: '2026-06-02',
    depositPaidDateIso: '',
    pickupScheduledDateIso: '2026-06-20',
    completedDateIso: '',
    balanceReminderDateIso: '2026-06-18',
    paymentMethod: 'Cash / Venmo',
    termsSummary: '',
    healthGuaranteeNotes: '',
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  };
}

const baseSettings: BarnSettings = {
  id: 'barn_settings',
  barnName: 'Copper Creek Barn',
  breederName: 'Breeder H.',
  preferredUnit: 'lbs_oz',
  currencyCode: 'USD',
  defaultSpecies: 'Rabbit',
  pinnedLandingSpecies: '',
  defaultGenerations: 3,
  themeMode: 'dark',
  updatedAt: TS,
};

describe('clientCrm engine', () => {
  it('computes reservation deposit coverage, balance remaining, and suggested status accurately', () => {
    const unpaid = evaluateReservationFinancials(makeReservation());
    expect(unpaid.depositRemainingCents).toBe(5000);
    expect(unpaid.balanceRemainingCents).toBe(15000);
    expect(unpaid.isDepositSatisfied).toBe(false);
    expect(unpaid.isPaidInFull).toBe(false);
    expect(unpaid.suggestedStatus).toBe('Pending Deposit');

    const deposited = evaluateReservationFinancials(
      makeReservation({ depositPaidCents: 5000, status: 'Pending Deposit' })
    );
    expect(deposited.depositRemainingCents).toBe(0);
    expect(deposited.balanceRemainingCents).toBe(10000);
    expect(deposited.depositCoveragePercent).toBe(100);
    expect(deposited.totalPaidPercent).toBe(33);
    expect(deposited.isDepositSatisfied).toBe(true);
    expect(deposited.suggestedStatus).toBe('Deposit Paid');

    const paidFull = evaluateReservationFinancials(
      makeReservation({ depositPaidCents: 15000, status: 'Deposit Paid' })
    );
    expect(paidFull.balanceRemainingCents).toBe(0);
    expect(paidFull.isPaidInFull).toBe(true);
    expect(paidFull.suggestedStatus).toBe('Paid in Full');
  });

  it('builds sequential agreement numbers cleanly', () => {
    expect(buildSuggestedAgreementNumber([])).toBe('SA-0001');
    expect(
      buildSuggestedAgreementNumber([
        { agreementNumber: 'SA-0004' },
        { agreementNumber: 'SA-0012' },
      ])
    ).toBe('SA-0013');
  });

  it('detects overdue deposits, expiring holds, upcoming pickups, and waitlist follow-ups sorted by urgency', () => {
    const summary = evaluateCrmFollowUpReminders({
      clients: [makeClient()],
      waitlistEntries: [makeWaitlist({ followUpDateIso: '2026-06-05' })],
      reservations: [
        makeReservation({
          depositDueDateIso: '2026-06-01', // 3 days overdue relative to 2026-06-04
          holdExpiresDateIso: '2026-06-04', // due today
          pickupScheduledDateIso: '2026-06-07', // upcoming in 3d
          balanceReminderDateIso: '2026-06-15', // > 3d lead, ignored for now
        }),
        makeReservation({
          id: 'res-done',
          status: 'Picked Up / Completed',
          depositPaidCents: 20000,
          totalPriceCents: 20000,
        }),
        makeReservation({
          id: 'res-cancel',
          status: 'Cancelled',
          depositDueDateIso: '2026-05-01',
        }),
      ],
      todayIso: '2026-06-04',
    });

    expect(summary.activeReservationsCount).toBe(1);
    expect(summary.completedReservationsCount).toBe(1);
    expect(summary.outstandingDepositsCents).toBe(5000);
    expect(summary.collectedDepositsCents).toBe(20000);
    expect(summary.overdueReminderCount).toBe(1);
    expect(summary.reminders.map((r) => r.kind)).toEqual([
      'deposit_overdue',
      'hold_expiring',
      'waitlist_follow_up',
      'pickup_upcoming',
    ]);
  });

  it('matches waitlist entries to available unreserved animals and active breedings only', () => {
    const animals: Animal[] = [
      {
        id: 'a-match',
        tattoo: 'M1',
        name: 'Maple',
        species: 'Rabbit',
        breed: 'Holland Lop',
        variety: 'Broken Tort',
        sex: 'Female',
        status: 'Junior',
        birthDateIso: '2026-04-01',
        weightGrams: 900,
        genotype: [],
        genotypeRaw: '',
        registrationNumber: '',
        grandChampionNumber: '',
        legsCount: 0,
        cageLocation: '',
        breederName: '',
        ownerName: '',
        sireId: '',
        damId: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'a-reserved',
        tattoo: 'M2',
        name: 'Clover',
        species: 'Rabbit',
        breed: 'Holland Lop',
        variety: 'Broken Tort',
        sex: 'Female',
        status: 'Junior',
        birthDateIso: '2026-04-01',
        weightGrams: 900,
        genotype: [],
        genotypeRaw: '',
        registrationNumber: '',
        grandChampionNumber: '',
        legsCount: 0,
        cageLocation: '',
        breederName: '',
        ownerName: '',
        sireId: '',
        damId: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'a-buck',
        tattoo: 'B1',
        name: 'Buckley',
        species: 'Rabbit',
        breed: 'Holland Lop',
        variety: 'Broken Tort',
        sex: 'Male',
        status: 'Active',
        birthDateIso: '2025-04-01',
        weightGrams: 1700,
        genotype: [],
        genotypeRaw: '',
        registrationNumber: '',
        grandChampionNumber: '',
        legsCount: 0,
        cageLocation: '',
        breederName: '',
        ownerName: '',
        sireId: '',
        damId: '',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const breedings: BreedingRecord[] = [
      {
        id: 'br-1',
        species: 'Rabbit',
        sireId: 'a-buck',
        damId: 'dam-1',
        sireName: 'Buckley',
        damName: 'Daisy',
        bredDateIso: '2026-05-20',
        expectedDueDateIso: '2026-06-20',
        actualBirthDateIso: '',
        projectedCoiPercent: 0,
        liveCount: 0,
        stillbornCount: 0,
        fosteredCount: 0,
        weanedCount: 0,
        offspringCreated: false,
        status: 'Bred',
        notes: '',
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const matches = findWaitlistMatches(
      makeWaitlist({ preferredBreedingId: 'br-1' }),
      animals,
      breedings,
      [makeReservation({ animalId: 'a-reserved', status: 'Deposit Paid' })]
    );
    expect(matches.some((m) => m.id === 'a-match')).toBe(true);
    expect(matches.some((m) => m.id === 'a-reserved')).toBe(false);
    expect(matches.some((m) => m.id === 'a-buck')).toBe(false);
    expect(matches.some((m) => m.id === 'br-1')).toBe(true);
  });

  it('escapes CSV formulas and renders XSS-safe Sales Agreement HTML with active withdrawal notices', () => {
    const clientsCsv = formatClientsCsv([makeClient({ fullName: '=SUM(A1)' })]);
    expect(clientsCsv.startsWith('\uFEFF')).toBe(true);
    expect(clientsCsv).toContain("'=SUM(A1)");

    const waitlistCsv = formatWaitlistCsv([makeWaitlist()]);
    expect(waitlistCsv).toContain('Alice Walker');

    const resCsv = formatReservationsCsv([makeReservation()]);
    expect(resCsv).toContain('SA-0001');

    const html = generateSalesAgreementHtml({
      reservation: makeReservation({
        notes: '<script>alert("xss")</script>',
      }),
      client: makeClient({ fullName: '<b>Buyer & Sons</b>' }),
      settings: baseSettings,
      activeWithdrawal: {
        animalId: 'a-1',
        isActive: true,
        clearDateIso: '2026-06-15',
        daysRemaining: 11,
        countdownLabel: '11 days remaining',
        shortCountdownLabel: '11d left',
        activeLogs: [],
        medicationSummary: 'Ivermectin',
      },
      generatedDateIso: '2026-06-04',
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;b&gt;Buyer &amp; Sons&lt;/b&gt;');
    expect(html).toContain('ACTIVE MEDICATION WITHDRAWAL DISCLOSURE');
    expect(html).toContain('Ivermectin');
    expect(html).toContain('SA-0001');
  });
});
