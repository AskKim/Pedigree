import { describe, expect, it } from 'vitest';
import {
  Animal,
  BarnDatabaseSnapshot,
  BreedingRecord,
  CareLog,
} from '../models';
import {
  analyzeAnimalCarrierLineage,
  analyzePairingCarrierRisks,
  analyzePairingCarrierRisksFromAnalyses,
} from '../carrierGenetics';
import {
  buildSpeciesHerdMap,
  calculateAnimalCoi,
  calculatePairingCoi,
  createSpeciesCoiEvaluator,
} from '../pedigreeCalculator';
import { buildReportCatalogForSpecies } from '../reportCatalog';
import {
  buildPrintableReportHtml,
  buildReportFileName,
  exportReportToCsv,
  generateSpeciesReport,
} from '../reportGenerators';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

const TS = '2026-11-01T12:00:00.000Z';

function buildMultiSpeciesTestSnapshot(): BarnDatabaseSnapshot {
  const rabbitProfile = {
    ...makeSpeciesProfile('Rabbit'),
    preferredUnit: 'lbs_oz' as const,
    maturityDays: 150,
    weanDaysAfterBirth: 42,
  };
  const goatProfile = {
    ...makeSpeciesProfile('Goat'),
    preferredUnit: 'kg' as const,
    maturityDays: 240,
    weanDaysAfterBirth: 60,
  };

  // Founder pair (outcross parents)
  const rFounderBuck = makeAnimal('r-buck-1', {
    species: 'Rabbit',
    name: 'Apollo',
    tattoo: 'RB-01',
    sex: 'Male',
    status: 'Active',
    birthDateIso: '2024-03-01',
    weightGrams: 4536, // 10 lb 0 oz
    breed: 'New Zealand',
    variety: 'Red',
    cageLocation: 'Barn A-1',
    registrationNumber: 'ARBA-101',
    legsCount: 3,
    ownershipType: 'Owned',
  });

  const rDoe1 = makeAnimal('r-doe-1', {
    species: 'Rabbit',
    name: 'Clover',
    tattoo: 'RB-02',
    sex: 'Female',
    status: 'Active',
    birthDateIso: '2024-04-01',
    weightGrams: 4800,
    breed: 'New Zealand',
    variety: 'Red',
    cageLocation: 'Barn A-2',
    registrationNumber: 'ARBA-102',
    confirmedCarrierOf: ['Dilute (dd)'],
    ownershipType: 'Owned',
  });

  // Unmarked juvenile buck (born 2026-08-20 -> 72 days old on 2026-10-31 -> Non-Adult < 150d)
  const rJrBuck = makeAnimal('r-jr-buck', {
    species: 'Rabbit',
    name: 'Pip',
    tattoo: '',
    registrationNumber: '',
    sex: 'Male',
    status: 'Junior',
    birthDateIso: '2026-08-20',
    weightGrams: 1800,
    sireId: rFounderBuck.id,
    damId: rDoe1.id,
    cageLocation: 'Growout-1',
    ownershipType: 'Owned',
  });

  // Juvenile doe flagged for culling
  const rJrDoe = makeAnimal('r-jr-doe', {
    species: 'Rabbit',
    name: 'Willow',
    tattoo: 'RB-04',
    sex: 'Female',
    status: 'Active',
    birthDateIso: '2026-07-15', // 108 days old on 2026-10-31 -> Non-Adult < 150d
    weightGrams: 2200,
    sireId: rFounderBuck.id,
    damId: rDoe1.id,
    culled: true,
    cullDateIso: '2026-10-15',
    cullReason: 'Pinched hindquarters',
    ownershipType: 'Owned',
  });

  // Sold offspring out of Clover (Female Income + Sold Stock)
  const rSoldOffspring = makeAnimal('r-sold-kit', {
    species: 'Rabbit',
    name: 'Copper Kid',
    tattoo: 'RB-05',
    sex: 'Male',
    status: 'Sold',
    birthDateIso: '2026-03-01',
    soldDateIso: '2026-06-15',
    salePriceCents: 12500,
    purchaseCostCents: 2000,
    buyerName: 'Hilltop Acres',
    sireId: rFounderBuck.id,
    damId: rDoe1.id,
    weightGrams: 3400,
    ownershipType: 'Owned',
  });

  // Deceased non-adult rabbit
  const rDeadKit = makeAnimal('r-dead-kit', {
    species: 'Rabbit',
    name: 'Shadow',
    tattoo: 'RB-06',
    sex: 'Female',
    status: 'Deceased',
    birthDateIso: '2026-09-01',
    deceasedDateIso: '2026-10-05', // 34 days old -> Non-Adult
    deathCause: 'Weaning bloat',
    sireId: rFounderBuck.id,
    damId: rDoe1.id,
    ownershipType: 'Owned',
  });

  // Outside unrelated Doe (ideal outcross match) & Outside Reference Sire
  const rOutcrossDoe = makeAnimal('r-doe-outcross', {
    species: 'Rabbit',
    name: 'Saffron',
    tattoo: 'EXT-90',
    sex: 'Female',
    status: 'Active',
    birthDateIso: '2024-05-10',
    weightGrams: 4600,
    breed: 'New Zealand',
    variety: 'Red',
    ownershipType: 'Outside',
    ownerName: 'Maple Creek Farm',
  });

  const rRefBuck = makeAnimal('r-ref-buck', {
    species: 'Rabbit',
    name: 'Titan',
    tattoo: 'REF-11',
    sex: 'Male',
    status: 'Retired',
    birthDateIso: '2022-01-01',
    confirmedCarrierOf: ['Dilute (dd)'],
    ownershipType: 'Reference',
    ownerName: 'Heritage Lines',
  });

  // Another active breeding male unrelated to Clover
  const rOutcrossBuck = makeAnimal('r-buck-outcross', {
    species: 'Rabbit',
    name: 'Bramble',
    tattoo: 'RB-09',
    sex: 'Male',
    status: 'Active',
    birthDateIso: '2024-06-01',
    weightGrams: 4400,
    breed: 'New Zealand',
    variety: 'Red',
    confirmedCarrierOf: ['Dilute (dd)'],
    ownershipType: 'Owned',
  });

  // Separate Species: Goat (strictly isolated)
  const goatBuck = makeAnimal('g-buck-1', {
    species: 'Goat',
    name: 'Summit King',
    tattoo: 'GT-10',
    sex: 'Male',
    status: 'Active',
    birthDateIso: '2023-02-01',
    weightGrams: 38500, // 38.50 kg
    breed: 'Nigerian Dwarf',
    ownershipType: 'Owned',
  });

  const goatDoe = makeAnimal('g-doe-1', {
    species: 'Goat',
    name: 'Meadowlark',
    tattoo: 'GT-20',
    sex: 'Female',
    status: 'Active',
    birthDateIso: '2023-03-15',
    weightGrams: 31250, // 31.25 kg
    breed: 'Nigerian Dwarf',
    ownershipType: 'Owned',
  });

  const breedings: BreedingRecord[] = [
    {
      id: 'br-r-1',
      species: 'Rabbit',
      sireId: rFounderBuck.id,
      damId: rDoe1.id,
      sireName: rFounderBuck.name,
      damName: rDoe1.name,
      bredDateIso: '2026-10-05',
      expectedDueDateIso: '2026-11-05',
      actualBirthDateIso: '',
      projectedCoiPercent: 0,
      liveCount: 0,
      stillbornCount: 0,
      fosteredCount: 0,
      weanedCount: 0,
      offspringCreated: false,
      status: 'Palpated Positive',
      serviceFeeCents: 7500,
      serviceFeeDirection: 'earned',
      ultrasoundDateIso: '2026-10-20',
      ultrasoundResult: 'Positive',
      ultrasoundFetalCount: 6,
      ultrasoundProjectedDueIso: '2026-11-04',
      notes: 'Clear fetal sacs',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'br-r-2',
      species: 'Rabbit',
      sireId: rFounderBuck.id,
      damId: rDoe1.id,
      sireName: rFounderBuck.name,
      damName: rDoe1.name,
      bredDateIso: '2026-01-25',
      expectedDueDateIso: '2026-02-25',
      actualBirthDateIso: '2026-02-26',
      projectedCoiPercent: 0,
      liveCount: 8,
      stillbornCount: 1,
      fosteredCount: 0,
      weanedCount: 7,
      offspringCreated: true,
      status: 'Weaned',
      serviceFeeCents: 4000,
      serviceFeeDirection: 'paid',
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'br-g-1',
      species: 'Goat',
      sireId: goatBuck.id,
      damId: goatDoe.id,
      sireName: goatBuck.name,
      damName: goatDoe.name,
      bredDateIso: '2026-08-01',
      expectedDueDateIso: '2026-12-29',
      actualBirthDateIso: '',
      projectedCoiPercent: 0,
      liveCount: 0,
      stillbornCount: 0,
      fosteredCount: 0,
      weanedCount: 0,
      offspringCreated: false,
      status: 'Bred',
      serviceFeeCents: 15000,
      serviceFeeDirection: 'earned',
      ultrasoundDateIso: '2026-09-10',
      ultrasoundResult: 'Positive',
      ultrasoundFetalCount: 2,
      ultrasoundProjectedDueIso: '2026-12-28',
      notes: 'Twins visible',
      createdAt: TS,
      updatedAt: TS,
    },
  ];

  const careLogs: CareLog[] = [
    {
      id: 'cl-wt-1',
      species: 'Rabbit',
      animalId: rJrBuck.id,
      dateIso: '2026-10-01',
      type: 'Weight Check',
      title: '6-Week Weight',
      weightGrams: 1100,
      showLegEarned: false,
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'cl-wt-2',
      species: 'Rabbit',
      animalId: rJrBuck.id,
      dateIso: '2026-10-21',
      type: 'Weight Check',
      title: '9-Week Weight',
      weightGrams: 1800, // +700g over 20 days = 35 g/day
      showLegEarned: false,
      notes: '',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'cl-med-1',
      species: 'Rabbit',
      animalId: rFounderBuck.id,
      dateIso: '2026-10-20',
      type: 'Health / Vet',
      title: 'Ear Mite Treatment',
      weightGrams: 0,
      showLegEarned: false,
      medicationName: 'Ivermectin 1%',
      dosage: '0.2 mL',
      administrationRoute: 'SubQ',
      withdrawalDays: 28,
      withdrawalClearDateIso: '2026-11-17',
      notes: 'Hold until Nov 17',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'cl-bcs-1',
      species: 'Goat',
      animalId: goatDoe.id,
      dateIso: '2026-10-25',
      type: 'Health Score / BCS',
      title: 'Pre-winter parasite check',
      weightGrams: 0,
      showLegEarned: false,
      bodyConditionScore: 3.5,
      famachaScore: 4,
      fecalEggCount: 1200,
      notes: 'Schedule deworming recheck',
      createdAt: TS,
      updatedAt: TS,
    },
    {
      id: 'cl-us-1',
      species: 'Goat',
      animalId: goatDoe.id,
      dateIso: '2026-09-12',
      type: 'Ultrasound',
      title: 'Re-check scan',
      weightGrams: 0,
      showLegEarned: false,
      ultrasoundResult: 'Positive',
      ultrasoundFetalCount: 2,
      notes: 'Confirmed heartbeat',
      createdAt: TS,
      updatedAt: TS,
    },
  ];

  return makeEmptySnapshot({
    settings: makeSettings({
      barnName: 'Copper Creek Barn',
      currencyCode: 'CAD',
      preferredUnit: 'lbs',
    }),
    speciesProfiles: [rabbitProfile, goatProfile],
    animals: [
      rFounderBuck,
      rDoe1,
      rJrBuck,
      rJrDoe,
      rSoldOffspring,
      rDeadKit,
      rOutcrossDoe,
      rRefBuck,
      rOutcrossBuck,
      goatBuck,
      goatDoe,
    ],
    breedings,
    careLogs,
  });
}

describe('reportGenerators (Phase 3)', () => {
  it('generates every single one of the 26 catalog reports for an added species without errors', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();
    const rabbitProfile = snapshot.speciesProfiles[0];
    const catalog = buildReportCatalogForSpecies(rabbitProfile);

    expect(catalog).toHaveLength(26);

    for (const entry of catalog) {
      const rep = generateSpeciesReport(snapshot, 'Rabbit', entry.id, {
        referenceDateIso: '2026-10-31',
      });
      expect(rep.speciesAdded).toBe(true);
      expect(rep.speciesName).toBe('Rabbit');
      expect(rep.columns.length).toBeGreaterThan(0);

      // CSV and printable HTML must work for every report
      const csv = exportReportToCsv(rep);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      const html = buildPrintableReportHtml(rep, snapshot.settings);
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain(entry.title.replace(/&/g, '&amp;'));
    }
  });

  it('refuses to leak data or generate presets for unadded species', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();
    const rep = generateSpeciesReport(snapshot, 'Cattle', 'roster-report');

    expect(rep.speciesAdded).toBe(false);
    expect(rep.rows).toHaveLength(0);
    expect(rep.summaryMetrics[0]?.value).toBe('Not Added to Barn');
  });

  it('strictly isolates records per species and uses species weight unit overrides', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const rabbitRoster = generateSpeciesReport(snapshot, 'Rabbit', 'roster-report', {
      referenceDateIso: '2026-10-31',
    });
    const rabbitNames = rabbitRoster.rows.map((r) => String(r.cells.name));
    expect(rabbitNames).toContain('Apollo');
    expect(rabbitNames).not.toContain('Summit King');
    expect(rabbitNames).not.toContain('Meadowlark');
    expect(rabbitRoster.weightUnit).toBe('lbs_oz');
    const apolloRow = rabbitRoster.rows.find((r) => r.cells.name === 'Apollo');
    expect(String(apolloRow?.cells.weight)).toContain('lb');

    const goatRoster = generateSpeciesReport(snapshot, 'Goat', 'roster-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(goatRoster.rows).toHaveLength(2);
    expect(goatRoster.weightUnit).toBe('kg');
    const goatRow = goatRoster.rows.find((r) => r.cells.name === 'Summit King');
    expect(goatRow?.cells.weight).toBe('38.50 kg');
  });

  it('applies All / Male / Female / Non-Adult Male / Non-Adult Female audience filters and maturityDays', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const nonAdultMales = generateSpeciesReport(snapshot, 'Rabbit', 'non-adult-report', {
      filter: 'Non-Adult Male',
      referenceDateIso: '2026-10-31',
    });
    expect(nonAdultMales.rows.map((r) => r.cells.name)).toEqual(['Pip']);

    const nonAdultFemales = generateSpeciesReport(snapshot, 'Rabbit', 'non-adult-report', {
      filter: 'Non-Adult Female',
      referenceDateIso: '2026-10-31',
    });
    expect(nonAdultFemales.rows.map((r) => r.cells.name)).toEqual(['Willow']);

    const maleOnlyRoster = generateSpeciesReport(snapshot, 'Rabbit', 'roster-report', {
      filter: 'Male',
      referenceDateIso: '2026-10-31',
    });
    expect(maleOnlyRoster.rows.every((r) => r.cells.sex === 'Buck')).toBe(true);
    expect(maleOnlyRoster.rows.map((r) => r.cells.name)).toContain('Apollo');
    expect(maleOnlyRoster.rows.map((r) => r.cells.name)).not.toContain('Clover');
  });

  it('computes Male Income, Female Income, and Sold Stock with configured currency', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const maleIncome = generateSpeciesReport(snapshot, 'Rabbit', 'male-income-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(maleIncome.currencyCode).toBe('CAD');
    const apolloIncome = maleIncome.rows.find((r) => r.cells.name === 'Apollo');
    expect(String(apolloIncome?.cells.studEarned)).toContain('$75.00');
    expect(String(apolloIncome?.cells.feesPaid)).toContain('$40.00');

    const femaleIncome = generateSpeciesReport(snapshot, 'Rabbit', 'female-income-report', {
      referenceDateIso: '2026-10-31',
    });
    const cloverIncome = femaleIncome.rows.find((r) => r.cells.name === 'Clover');
    expect(cloverIncome?.cells.offspringSold).toBe(1);
    expect(String(cloverIncome?.cells.offspringRevenue)).toContain('$125.00');
    expect(String(cloverIncome?.cells.studPaid)).toContain('$40.00');
    expect(String(cloverIncome?.cells.netIncome)).toContain('$85.00');

    const soldStock = generateSpeciesReport(snapshot, 'Rabbit', 'sold-stock-report');
    expect(soldStock.rows).toHaveLength(1);
    expect(soldStock.rows[0].cells.buyer).toBe('Hilltop Acres');
    expect(String(soldStock.rows[0].cells.netMargin)).toContain('$105.00');
  });

  it('computes ADG in Weight Gain Report, active withdrawal holds in Medicine Report, and BCS/FAMACHA alerts', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const weightGain = generateSpeciesReport(snapshot, 'Rabbit', 'weight-gain-report', {
      referenceDateIso: '2026-10-31',
    });
    const pipGain = weightGain.rows.find((r) => r.cells.name === 'Pip');
    expect(pipGain?.cells.days).toBe('20');
    expect(String(pipGain?.cells.adg)).toContain('35.0 g/day');

    const medReport = generateSpeciesReport(snapshot, 'Rabbit', 'medicine-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(medReport.rows).toHaveLength(1);
    expect(String(medReport.rows[0].cells.withdrawalStatus)).toContain('Active Hold');

    const clearedMedReport = generateSpeciesReport(snapshot, 'Rabbit', 'medicine-report', {
      referenceDateIso: '2026-11-20',
    });
    expect(clearedMedReport.rows[0].cells.withdrawalStatus).toBe('Cleared');

    const healthScore = generateSpeciesReport(snapshot, 'Goat', 'health-score-report');
    expect(healthScore.rows).toHaveLength(1);
    expect(healthScore.rows[0].cells.bcs).toBe('3.5');
    expect(healthScore.rows[0].cells.famacha).toBe('4 / 5');
    expect(healthScore.rows[0].cells.fec).toBe('1200 EPG');
    expect(healthScore.rows[0].highlightTone).toBe('danger');
  });

  it('handles ultrasound calendars, mortality ages, culls, missing IDs, ownership splits, and breed-with COI screening', () => {
    const snapshot = buildMultiSpeciesTestSnapshot();

    const usCalendar = generateSpeciesReport(snapshot, 'Rabbit', 'birth-calendar-ultrasounds');
    expect(usCalendar.rows).toHaveLength(1);
    expect(usCalendar.rows[0].cells.projectedDue).toBe('Nov 4, 2026');
    expect(usCalendar.rows[0].cells.estCount).toBe('6');

    const goatUltrasounds = generateSpeciesReport(snapshot, 'Goat', 'ultrasound-report');
    expect(goatUltrasounds.rows).toHaveLength(2); // 1 Breeding scan + 1 Care Log scan

    const deathReport = generateSpeciesReport(snapshot, 'Rabbit', 'death-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(deathReport.rows).toHaveLength(1);
    expect(deathReport.rows[0].cells.stageAtDeath).toBe('Non-Adult');
    expect(deathReport.rows[0].cells.ageAtDeath).toBe('34 d');

    const cullReport = generateSpeciesReport(snapshot, 'Rabbit', 'cull-report');
    expect(cullReport.rows).toHaveLength(1);
    expect(cullReport.rows[0].cells.reason).toBe('Pinched hindquarters');

    const unmarked = generateSpeciesReport(snapshot, 'Rabbit', 'unmarked-report');
    expect(unmarked.rows.some((r) => r.cells.name === 'Pip')).toBe(true);

    const owned = generateSpeciesReport(snapshot, 'Rabbit', 'my-owned-stock-report');
    const outside = generateSpeciesReport(snapshot, 'Rabbit', 'outside-reference-stock-report');
    expect(owned.rows.some((r) => r.cells.name === 'Saffron')).toBe(false);
    expect(outside.rows.map((r) => r.cells.name).sort()).toEqual(['Saffron', 'Titan']);

    const breedWith = generateSpeciesReport(snapshot, 'Rabbit', 'breed-with-report', {
      subjectAnimalId: 'r-doe-1',
    });
    // Outcross Apollo x Clover (0% COI, 0 confirmed carrier danger) should rank ahead of Bramble x Clover (both Confirmed Dilute carriers -> danger!)
    expect(breedWith.rows[0].cells.sire).toBe('Apollo');
    expect(breedWith.rows[0].cells.coi).toBe('0.00%');
    const brambleRow = breedWith.rows.find((r) => r.cells.sire === 'Bramble');
    expect(brambleRow?.highlightTone).toBe('danger');
    expect(String(brambleRow?.cells.carriers)).toContain('DANGER');

    const csvName = buildReportFileName(breedWith, 'csv', snapshot.settings.barnName);
    expect(csvName).toBe('copper-creek-barn-rabbit-breed-with-report-2026-11-01.csv'.replace('2026-11-01', breedWith.generatedAtDateIso));
  });

  it('matches uncached COI & carrier risk results identically via batch evaluators', () => {
    const fSire = makeAnimal('f-sire', { name: 'Founder Sire', sex: 'Male', confirmedCarrierOf: ['Dilute (dd)'] });
    const fDam = makeAnimal('f-dam', { name: 'Founder Dam', sex: 'Female' });
    const midBuck = makeAnimal('m-buck', {
      name: 'Mid Buck',
      sex: 'Male',
      sireId: fSire.id,
      damId: fDam.id,
    });
    const midDoe = makeAnimal('m-doe', {
      name: 'Mid Doe',
      sex: 'Female',
      sireId: fSire.id,
      damId: fDam.id,
      suspectedCarrierOf: ['Self (aa)'],
    });
    const linebredChild = makeAnimal('lb-child', {
      name: 'Linebred Child',
      sex: 'Female',
      sireId: midBuck.id,
      damId: midDoe.id,
    });
    const herd = [fSire, fDam, midBuck, midDoe, linebredChild];
    const herdMap = buildSpeciesHerdMap(herd, 'Rabbit');
    const evaluator = createSpeciesCoiEvaluator(herdMap);

    // Animal COI parity
    for (const animal of herd) {
      const expected = calculateAnimalCoi(animal, herdMap);
      const actual = evaluator.calculateAnimalCoi(animal);
      expect(actual.coiPercent).toBeCloseTo(expected.coiPercent, 8);
      expect(actual.knownAncestorsIn3Gen).toBe(expected.knownAncestorsIn3Gen);
      expect(actual.knownAncestorsIn4Gen).toBe(expected.knownAncestorsIn4Gen);
      expect(actual.sharedAncestors.map((s) => [s.ancestor.id, s.coiContributionPercent])).toEqual(
        expected.sharedAncestors.map((s) => [s.ancestor.id, s.coiContributionPercent])
      );
    }

    // Pairing COI & carrier risk parity (linebred backcross + full-sib)
    const pairs: Array<[Animal, Animal]> = [
      [midBuck, midDoe],
      [midBuck, linebredChild],
      [fSire, linebredChild],
    ];
    for (const [sire, dam] of pairs) {
      const expectedCoi = calculatePairingCoi(sire.id, dam.id, herdMap);
      const actualCoi = evaluator.calculatePairingCoi(sire.id, dam.id);
      expect(actualCoi.coiPercent).toBeCloseTo(expectedCoi.coiPercent, 8);
      expect(actualCoi.knownAncestorsIn3Gen).toBe(expectedCoi.knownAncestorsIn3Gen);
      expect(actualCoi.knownAncestorsIn4Gen).toBe(expectedCoi.knownAncestorsIn4Gen);
      expect(actualCoi.sharedAncestors.map((s) => [s.ancestor.id, s.coiContributionPercent])).toEqual(
        expectedCoi.sharedAncestors.map((s) => [s.ancestor.id, s.coiContributionPercent])
      );

      const expectedCarrier = analyzePairingCarrierRisks(sire, dam, herdMap);
      const actualCarrier = analyzePairingCarrierRisksFromAnalyses(
        analyzeAnimalCarrierLineage(sire, herdMap),
        analyzeAnimalCarrierLineage(dam, herdMap)
      );
      expect(actualCarrier).toEqual(expectedCarrier);
    }
  });

  it('rejects invalid calendar dates like Feb 31 in Weight Gain Report and formats zero delta cleanly', () => {
    const base = buildMultiSpeciesTestSnapshot();
    const flatBuck = makeAnimal('r-flat', {
      species: 'Rabbit',
      name: 'Flatline',
      tattoo: 'FL-1',
      sex: 'Male',
      status: 'Active',
      weightGrams: 2000,
    });
    const invalidDateBuck = makeAnimal('r-bad-date', {
      species: 'Rabbit',
      name: 'BadDate',
      tattoo: 'BD-1',
      sex: 'Male',
      status: 'Active',
      weightGrams: 2500,
    });

    const snap: BarnDatabaseSnapshot = {
      ...base,
      animals: [...base.animals, flatBuck, invalidDateBuck],
      careLogs: [
        ...base.careLogs,
        {
          id: 'cl-flat-1',
          species: 'Rabbit',
          animalId: flatBuck.id,
          dateIso: '2026-10-01',
          type: 'Weight Check',
          title: 'Check 1',
          weightGrams: 2000,
          showLegEarned: false,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'cl-flat-2',
          species: 'Rabbit',
          animalId: flatBuck.id,
          dateIso: '2026-10-11',
          type: 'Weight Check',
          title: 'Check 2',
          weightGrams: 2000,
          showLegEarned: false,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'cl-bad-1',
          species: 'Rabbit',
          animalId: invalidDateBuck.id,
          dateIso: '2026-02-31',
          type: 'Weight Check',
          title: 'Bad Check 1',
          weightGrams: 1500,
          showLegEarned: false,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'cl-bad-2',
          species: 'Rabbit',
          animalId: invalidDateBuck.id,
          dateIso: '2026-03-05',
          type: 'Weight Check',
          title: 'Valid Check 2',
          weightGrams: 2500,
          showLegEarned: false,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    };

    const weightGain = generateSpeciesReport(snap, 'Rabbit', 'weight-gain-report', {
      referenceDateIso: '2026-10-31',
    });

    const flatRow = weightGain.rows.find((r) => r.cells.name === 'Flatline');
    expect(flatRow?.cells.totalGain).toBe('0');
    expect(flatRow?.cells.adg).toBe('0.000 lb/day (0.0 g/day)');

    // Invalid calendar date 2026-02-31 must not roll over to Mar 3 or produce bogus days/ADG
    const badRow = weightGain.rows.find((r) => r.cells.name === 'BadDate');
    expect(badRow).toBeDefined();
    expect(badRow?.cells.days).toBe('—');
    expect(badRow?.cells.adg).toBe('—');
    expect(String(badRow?.cells.startWeight)).toContain('(2026-02-31)');
  });

  it('builds Litter Survival & Parent Performance Report with Male/Female role switching', () => {
    const base = buildMultiSpeciesTestSnapshot();
    const snap: BarnDatabaseSnapshot = {
      ...base,
      breedings: [
        ...base.breedings,
        {
          id: 'br-r-survival-1',
          species: 'Rabbit',
          sireId: 'r-buck-outcross',
          damId: 'r-doe-outcross',
          sireName: 'Bramble',
          damName: 'Saffron',
          bredDateIso: '2026-06-01',
          expectedDueDateIso: '2026-07-02',
          actualBirthDateIso: '2026-07-02',
          projectedCoiPercent: 0,
          liveCount: 8,
          stillbornCount: 2,
          fosteredCount: 0,
          weanedCount: 7,
          offspringCreated: false,
          status: 'Weaned',
          litterWeightMilestones: [
            {
              id: 'ms-21d',
              ageDays: 21,
              label: '3-Week',
              liveCount: 7,
              totalWeightGrams: 3500,
              avgWeightGrams: 500,
            },
            {
              id: 'ms-56d',
              ageDays: 56,
              label: '8-Week',
              liveCount: 7,
              totalWeightGrams: 13300,
              avgWeightGrams: 1900,
            },
          ],
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    };

    const femaleReport = generateSpeciesReport(snap, 'Rabbit', 'litter-survival-performance-report', {
      filter: 'Female',
    });
    expect(femaleReport.columns[0].label).toBe('Female');
    const saffronRow = femaleReport.rows.find((r) => r.cells.parent === 'Saffron');
    expect(saffronRow).toBeDefined();
    expect(saffronRow?.cells.liveBorn).toBe('8');
    expect(saffronRow?.cells.stillborn).toBe('2');
    expect(saffronRow?.cells.liveBirthPct).toBe('80.0%');
    expect(saffronRow?.cells.weanSurvivalPct).toBe('87.5%');
    expect(saffronRow?.highlightTone).toBe('success');

    const maleReport = generateSpeciesReport(snap, 'Rabbit', 'litter-survival-performance-report', {
      filter: 'Male',
    });
    expect(maleReport.columns[0].label).toBe('Male');
    const brambleRow = maleReport.rows.find((r) => r.cells.parent === 'Bramble');
    expect(brambleRow).toBeDefined();
    expect(brambleRow?.cells.weaned).toBe('7');
  });

  it('generates Barn Economics, Meat & Pelt Yield, and 4-H/FFA Youth Project reports cleanly', () => {
    const base = buildMultiSpeciesTestSnapshot();
    const snap = {
      ...base,
      ledgerEntries: [
        {
          id: 'rep-le-1',
          species: 'Rabbit',
          dateIso: '2026-10-05',
          entryType: 'expense' as const,
          category: 'bedding' as const,
          amountCents: 1850,
          title: 'Shavings Bale',
          vendorOrParty: 'Feed Store',
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
      processingLogs: [
        {
          id: 'rep-pl-1',
          species: 'Rabbit',
          title: 'Fall Fryer Batch',
          scheduledDateIso: '2026-10-10',
          harvestDateIso: '2026-10-10',
          status: 'Processed' as const,
          animalCount: 3,
          liveWeightGrams: 7500,
          dressedWeightGrams: 4350,
          dressOutPercent: 58,
          peltCount: 3,
          peltGrade: 'Prime' as const,
          peltColorNotes: 'White',
          meatValueCents: 4500,
          peltValueCents: 1200,
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
      youthProjectBooks: [
        {
          id: 'rep-yp-1',
          species: 'Rabbit',
          organization: '4-H' as const,
          projectTitle: 'County Fair Market Pen',
          memberName: 'Jordan Lee',
          clubOrChapter: 'Pine Creek 4-H',
          leaderOrAdvisor: 'Kim',
          projectYear: '2026',
          startDateIso: '2026-02-01',
          endDateIso: '2026-10-15',
          status: 'Completed' as const,
          linkedAnimalIds: [],
          linkedBreedingIds: [],
          startingInventoryValueCents: 3000,
          endingInventoryValueCents: 4500,
          feedLogs: [],
          goalsAndReflection: 'Completed record book.',
          showAndCommunityNotes: '',
          notes: '',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    };

    const econRep = generateSpeciesReport(snap, 'Rabbit', 'barn-economics-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(econRep.rows.some((r) => String(r.cells.title) === 'Shavings Bale')).toBe(true);

    const yieldRep = generateSpeciesReport(snap, 'Rabbit', 'meat-pelt-yield-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(yieldRep.rows.some((r) => String(r.cells.title) === 'Fall Fryer Batch')).toBe(true);
    expect(yieldRep.rows[0]?.cells.dressOut).toBe('58.0%');

    const youthRep = generateSpeciesReport(snap, 'Rabbit', 'youth-project-report', {
      referenceDateIso: '2026-10-31',
    });
    expect(youthRep.rows).toHaveLength(1);
    expect(youthRep.rows[0]?.cells.title).toBe('County Fair Market Pen');
  });
});
