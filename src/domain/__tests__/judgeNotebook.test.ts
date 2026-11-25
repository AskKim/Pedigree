/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Unit tests for The Judge's Notebook (`src/domain/judgeNotebook.ts`) plus round-trip
 * persistence/sync/export/migration guarantees.
 */

import { describe, expect, it } from 'vitest';
import { repairBarnDataHealth } from '../dataHealthCheck';
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
  normalizeJudgeAssignment,
  normalizeJudgeClubContact,
  normalizeJudgeExpense,
  summarizeJudgeNotebook,
} from '../judgeNotebook';
import {
  BarnSettings,
  DEFAULT_IRS_MILEAGE_RATE_CENTS,
  MileageLog,
} from '../models';
import { migrateAnimalsToSpecies } from '../speciesMigration';
import { exportBarnBackupJson, mergeBarnSnapshots, parseBarnBackupJson } from '../syncAndExports';
import { diffSnapshotsToSyncOperations } from '../syncOutbox';
import { makeEmptySnapshot, makeSettings } from './testFixtures';

describe('judgeNotebook — normalizers, conflicts, financials, exports & contracts', () => {
  it('normalizes JudgeClubContact, JudgeAssignment, and JudgeExpense while rejecting invalid records', () => {
    expect(normalizeJudgeClubContact(null)).toBeNull();
    expect(normalizeJudgeClubContact({ id: 'c1', clubName: '   ' })).toBeNull();

    const club = normalizeJudgeClubContact({
      id: 'club-1',
      species: 'Rabbit',
      clubName: 'Heartland\u0000 Rabbit Breeders\nClub',
      sanctioningBody: '',
      contactPerson: 'Jane Secretary',
      roleTitle: 'Show Secretary',
      email: 'sec@example.org',
      phone: '555-0101',
      cityState: 'Ames, IA',
      venueName: 'Fairgrounds Pavilion',
      notes: 'Double open & youth',
    });
    expect(club).not.toBeNull();
    expect(club?.clubName).toBe('Heartland Rabbit Breeders Club');
    expect(club?.sanctioningBody).toBe('ARBA');

    expect(normalizeJudgeAssignment({ id: 'a1', showName: '' })).toBeNull();
    const assignment = normalizeJudgeAssignment({
      id: 'assign-1',
      species: 'Rabbit',
      showName: 'Spring Classic',
      showDateIso: '2026-04-18',
      endDateIso: '2026-04-10', // earlier than start date -> clamped to ''
      bidStatus: 'confirmed',
      contractStatus: 'executed',
      judgingFeeCents: 25000,
      perDiemCents: 5000,
      estimatedMiles: 142.36,
      actualMiles: -10, // negative -> clamped to 0
    });
    expect(assignment).not.toBeNull();
    expect(assignment?.endDateIso).toBe('');
    expect(assignment?.bidStatus).toBe('Bid Accepted');
    expect(assignment?.contractStatus).toBe('Signed by Both');
    expect(assignment?.estimatedMiles).toBe(142.4);
    expect(assignment?.actualMiles).toBe(0);

    expect(normalizeJudgeExpense({ id: 'e1', description: '' })).toBeNull();
    const expense = normalizeJudgeExpense({
      id: 'exp-1',
      species: 'Rabbit',
      assignmentId: 'assign-1',
      dateIso: '2026-04-18',
      category: 'hotel room',
      description: 'Motel stay',
      amountCents: 13499,
      reimbursable: true,
      reimbursed: false,
    });
    expect(expense?.category).toBe('Lodging / Hotel');
    expect(expense?.taxDeductible).toBe(true);
  });

  it('detects overlapping active show weekends while ignoring Declined, Cancelled, or Void engagements', () => {
    const a1 = createJudgeAssignmentDraft('Rabbit', {
      id: 'a1',
      showName: 'Show Alpha',
      showDateIso: '2026-05-02',
      endDateIso: '2026-05-03',
      bidStatus: 'Contracted',
      contractStatus: 'Signed by Both',
    });
    const a2 = createJudgeAssignmentDraft('Rabbit', {
      id: 'a2',
      showName: 'Show Beta Overlap',
      showDateIso: '2026-05-03',
      endDateIso: '',
      bidStatus: 'Bid Submitted',
      contractStatus: 'Not Sent',
    });
    const a3Declined = createJudgeAssignmentDraft('Rabbit', {
      id: 'a3',
      showName: 'Show Declined Overlap',
      showDateIso: '2026-05-02',
      bidStatus: 'Declined',
      contractStatus: 'Void',
    });
    const a4Separate = createJudgeAssignmentDraft('Rabbit', {
      id: 'a4',
      showName: 'Show Next Week',
      showDateIso: '2026-05-10',
      bidStatus: 'Bid Accepted',
    });

    const conflicts = detectJudgeDateConflicts([a1, a2, a3Declined, a4Separate]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].showNameA).toBe('Show Alpha');
    expect(conflicts[0].showNameB).toBe('Show Beta Overlap');
    expect(conflicts[0].dateRangeA).toBe('2026-05-02 to 2026-05-03');
  });

  it('evaluates mileage priority (actual > linkedMileageLog > estimated), reimbursements, tax deductions, and annual totals', () => {
    const mileageLog: MileageLog = {
      id: 'mile-1',
      species: 'Rabbit',
      dateIso: '2026-06-14',
      purpose: 'Show Travel',
      origin: 'Home Barn',
      destination: 'Cedar Rapids',
      roundTrip: true,
      miles: 210,
      rateCentsPerMile: DEFAULT_IRS_MILEAGE_RATE_CENTS,
      taxDeductible: true,
      notes: '',
      createdAt: '2026-06-14T10:00:00.000Z',
      updatedAt: '2026-06-14T10:00:00.000Z',
    };

    const aLinked = createJudgeAssignmentDraft('Rabbit', {
      id: 'a-linked',
      showName: 'Midwest Open',
      showDateIso: '2026-06-14',
      bidStatus: 'Completed',
      contractStatus: 'Completed',
      judgingFeeCents: 30000,
      perDiemCents: 5000,
      mileageReimbursementRateCents: 70,
      estimatedMiles: 180,
      actualMiles: 0,
      linkedMileageLogId: 'mile-1',
      feePaid: false,
    });
    const aCancelled = createJudgeAssignmentDraft('Rabbit', {
      id: 'a-cancel',
      showName: 'Snowed Out Show',
      showDateIso: '2026-01-12',
      bidStatus: 'Cancelled',
      judgingFeeCents: 20000,
      feePaid: false,
    });

    const expPendingReimb = createJudgeExpenseDraft('Rabbit', {
      id: 'e1',
      assignmentId: 'a-linked',
      dateIso: '2026-06-14',
      category: 'Lodging / Hotel',
      description: 'Hotel 1 night',
      amountCents: 12000,
      reimbursable: true,
      reimbursed: false,
      taxDeductible: true,
    });
    const expReimbursed = createJudgeExpenseDraft('Rabbit', {
      id: 'e2',
      assignmentId: 'a-linked',
      dateIso: '2026-06-14',
      category: 'Meals / Per Diem',
      description: 'Judge Dinner',
      amountCents: 3000,
      reimbursable: true,
      reimbursed: true,
      taxDeductible: true,
    });
    const expOrphanOverhead = createJudgeExpenseDraft('Rabbit', {
      id: 'e3',
      dateIso: '2026-02-01',
      category: 'Sanction / License Fee',
      description: 'Annual Judge License',
      amountCents: 6000,
      reimbursable: false,
      reimbursed: false,
      taxDeductible: true,
    });

    const fin = evaluateJudgeAssignmentFinancials(
      aLinked,
      [expPendingReimb, expReimbursed],
      [mileageLog]
    );
    expect(fin.effectiveMiles).toBe(210);
    expect(fin.mileageAllowanceCents).toBe(14700);
    expect(fin.grossFeeAndPerDiemCents).toBe(35000);
    expect(fin.pendingReimbursementCents).toBe(12000);
    expect(fin.reimbursedExpensesCents).toBe(3000);
    expect(fin.taxDeductibleExpensesCents).toBe(12000);
    expect(fin.outstandingClubBalanceCents).toBe(47000);
    expect(fin.netJudgingIncomeCents).toBe(23000);

    const years = getAvailableJudgeYears([aLinked, aCancelled], [expOrphanOverhead]);
    expect(years).toEqual(['2026']);

    const summary = summarizeJudgeNotebook(
      [aLinked, aCancelled],
      [expPendingReimb, expReimbursed, expOrphanOverhead],
      [createJudgeClubDraft('Rabbit', { id: 'club-1', clubName: 'Iowa Club' })],
      [mileageLog],
      '2026-06-01',
      '2026'
    );
    expect(summary.totalAssignments).toBe(2);
    expect(summary.completedShowsCount).toBe(1);
    expect(summary.grossFeesCents).toBe(35000); // cancelled excluded
    expect(summary.unpaidFeesCents).toBe(35000);
    expect(summary.totalExpensesCents).toBe(21000);
    expect(summary.pendingReimbursementCents).toBe(12000);
    expect(summary.taxDeductibleExpensesCents).toBe(18000);
    expect(summary.netJudgingEarningsCents).toBe(17000); // 23000 - 6000 orphan overhead
  });

  it('filters assignments accurately and generates formula-safe CSV and XSS-escaped HTML contracts & reports', () => {
    const club = createJudgeClubDraft('Rabbit', {
      id: 'club-xss',
      clubName: '=SUM(1,2) <script>alert(1)</script> Valley Club',
      contactPerson: '<b>Secretary</b>',
    });
    const a1 = createJudgeAssignmentDraft('Rabbit', {
      id: 'a-1',
      showName: '=CMD() <img src=x onerror=alert(1)> Regional',
      clubId: club.id,
      clubName: club.clubName,
      showDateIso: '2026-09-12',
      bidStatus: 'Contracted',
      contractStatus: 'Signed by Both',
      contractNumber: 'C-2026-09',
      judgingFeeCents: 40000,
      estimatedMiles: 100,
      feePaid: false,
    });
    const exp = createJudgeExpenseDraft('Rabbit', {
      id: 'e-1',
      assignmentId: a1.id,
      dateIso: '2026-09-12',
      description: '+2+3 Hotel',
      amountCents: 15000,
    });

    const unpaidList = filterJudgeAssignments([a1], {
      timeframe: 'unpaid',
      query: 'regional',
      year: '2026',
    });
    expect(unpaidList).toHaveLength(1);

    const assignmentsCsv = exportJudgeAssignmentsCsv([a1], [exp], [], 'USD');
    expect(assignmentsCsv).toContain("'=CMD()");
    expect(buildJudgeCsvFileName('assignments', 'Rabbit')).toMatch(/^judge-assignments-rabbit-\d{4}-\d{2}-\d{2}\.csv$/);

    const expensesCsv = exportJudgeExpensesCsv([exp], [a1], 'USD');
    expect(expensesCsv).toContain("'+2+3 Hotel");

    const settings: BarnSettings = makeSettings({
      breederName: 'Judge <Script> Smith',
      currencyCode: 'USD',
    });
    const contractHtml = generateJudgeContractHtml(a1, club, settings);
    expect(contractHtml).not.toContain('<script>');
    expect(contractHtml).not.toContain('<img ');
    expect(contractHtml).toContain('&lt;Script&gt;');
    expect(contractHtml).toContain('C-2026-09');
    expect(buildJudgeContractFileName(a1)).toMatch(/^judging-contract-.*-2026-09-12\.htm$/);

    const summary = summarizeJudgeNotebook([a1], [exp], [club], [], '2026-09-01', '2026');
    const summaryHtml = generateJudgeSummaryReportHtml({
      summary,
      assignments: [a1],
      expenses: [exp],
      settings,
      scopeLabel: 'Rabbit',
    });
    expect(summaryHtml).not.toContain('<script>');
    expect(summaryHtml).not.toContain('<img ');
    expect(summaryHtml).toContain("The Judge's Notebook — Rabbit (2026)");
  });

  it('round-trips Judge records through JSON export/parse, snapshot merge, outbox diff, species migration, and health repair', () => {
    const snapA = makeEmptySnapshot();
    snapA.settings.enableJudgeNotebook = true;
    const club = createJudgeClubDraft('Rabbit', { id: 'jc-1', clubName: 'County Rabbit Club', _rev: 2 });
    const assign = createJudgeAssignmentDraft('Rabbit', {
      id: 'ja-1',
      clubId: 'jc-1',
      clubName: 'County Rabbit Club',
      showName: 'County Fair',
      showDateIso: '2026-08-15',
      _rev: 2,
    });
    const exp = createJudgeExpenseDraft('Rabbit', {
      id: 'je-1',
      assignmentId: 'ja-1',
      description: 'Fair Parking',
      amountCents: 2000,
      _rev: 2,
    });
    snapA.judgeClubs = [club];
    snapA.judgeAssignments = [assign];
    snapA.judgeExpenses = [exp];

    // JSON export & parse
    const exported = exportBarnBackupJson(snapA);
    const parsed = parseBarnBackupJson(exported, makeSettings());
    expect(parsed.settings.enableJudgeNotebook).toBe(true);
    expect(parsed.judgeClubs).toHaveLength(1);
    expect(parsed.judgeAssignments).toHaveLength(1);
    expect(parsed.judgeExpenses).toHaveLength(1);

    // Outbox diff
    const emptySnap = makeEmptySnapshot();
    let counter = 1;
    const ops = diffSnapshotsToSyncOperations({
      previous: emptySnap,
      next: snapA,
      deviceId: 'dev-judge-1',
      nextCounter: () => counter++,
    });
    expect(ops.some((o) => o.entity_type === 'judgeClub' && o.entity_uuid === 'jc-1')).toBe(true);
    expect(ops.some((o) => o.entity_type === 'judgeAssignment' && o.entity_uuid === 'ja-1')).toBe(true);
    expect(ops.some((o) => o.entity_type === 'judgeExpense' && o.entity_uuid === 'je-1')).toBe(true);

    // Merge snapshot
    const mergeReport = mergeBarnSnapshots(emptySnap, snapA);
    expect(mergeReport.snapshot.judgeClubs).toHaveLength(1);
    expect(mergeReport.snapshot.judgeAssignments).toHaveLength(1);
    expect(mergeReport.snapshot.judgeExpenses).toHaveLength(1);

    // Cross-species migration
    const migrated = migrateAnimalsToSpecies(snapA, [], 'Guinea Pig', {
      migrateEntireSpecies: true,
      sourceSpeciesName: 'Rabbit',
    });
    expect(migrated.snapshot.judgeClubs?.[0].species).toBe('Guinea Pig');
    expect(migrated.snapshot.judgeAssignments?.[0].species).toBe('Guinea Pig');
    expect(migrated.snapshot.judgeExpenses?.[0].species).toBe('Guinea Pig');

    // Data health check
    const repaired = repairBarnDataHealth(migrated.snapshot);
    expect(repaired.nextSnapshot.judgeClubs).toHaveLength(1);
    expect(repaired.nextSnapshot.judgeAssignments).toHaveLength(1);
    expect(repaired.nextSnapshot.judgeExpenses).toHaveLength(1);
  });
});
