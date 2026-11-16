import { describe, expect, it } from 'vitest';
import { exportAnimalsCsv } from '../csvExport';
import { resolveAnimalsWithConflictChoices } from '../importers/conflictResolver';
import {
  formatCurrencyCents,
  isAnimalNonAdult,
  normalizeOwnershipType,
  normalizeUltrasoundResult,
} from '../models';
import {
  buildPdfReadyBarnSnapshot,
  exportBarnBackupJson,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('Reports Phase 1 — structured fields, migrations, CSV/JSON round-trip & helpers', () => {
  it('round-trips all new settings, species, animal, breeding, and care log fields through JSON v5 backups and multi-device merge', () => {
    const rabbitProfile = {
      ...makeSpeciesProfile('Rabbit'),
      maturityDays: 180,
    };

    const soldAnimal = makeAnimal('a-sold', {
      name: 'Copper Baron',
      tattoo: 'CB-1',
      status: 'Sold',
      archived: true,
      ownershipType: 'Owned',
      soldDateIso: '2026-10-12',
      salePriceCents: 12500,
      purchaseCostCents: 4500,
      buyerName: 'Willow Creek Rabbitry',
    });

    const referenceDam = makeAnimal('a-ref', {
      name: 'Outside Empress',
      tattoo: 'EXT-9',
      sex: 'Female',
      status: 'Archived',
      archived: true,
      ownershipType: 'Reference',
      culled: true,
      cullDateIso: '2026-09-01',
      cullReason: 'Disposition / Pedigree only',
      deceasedDateIso: '2026-11-01',
      deathCause: 'Age',
    });

    const snap = makeEmptySnapshot({
      settings: makeSettings({ currencyCode: 'CAD' }),
      speciesProfiles: [rabbitProfile],
      animals: [soldAnimal, referenceDam],
      breedings: [
        {
          id: 'br-1',
          species: 'Rabbit',
          sireId: 'a-sold',
          damId: 'a-ref',
          sireName: 'Copper Baron',
          damName: 'Outside Empress',
          bredDateIso: '2026-09-10',
          expectedDueDateIso: '2026-10-11',
          actualBirthDateIso: '',
          projectedCoiPercent: 0,
          liveCount: 0,
          stillbornCount: 0,
          fosteredCount: 0,
          weanedCount: 0,
          offspringCreated: false,
          status: 'Palpated Positive',
          serviceFeeCents: 3500,
          serviceFeeDirection: 'earned',
          ultrasoundDateIso: '2026-09-24',
          ultrasoundResult: 'Positive',
          ultrasoundFetalCount: 6,
          ultrasoundProjectedDueIso: '2026-10-10',
          notes: 'Checked at day 14',
          createdAt: '2026-09-10T12:00:00.000Z',
          updatedAt: '2026-09-24T12:00:00.000Z',
        },
      ],
      careLogs: [
        {
          id: 'cl-med',
          species: 'Rabbit',
          animalId: 'a-sold',
          dateIso: '2026-09-05',
          type: 'Health / Vet',
          title: 'Ear mite treatment',
          weightGrams: 0,
          showLegEarned: false,
          medicationName: 'Ivermectin',
          dosage: '0.2 mL',
          administrationRoute: 'SubQ',
          withdrawalDays: 28,
          withdrawalClearDateIso: '2026-10-03',
          bodyConditionScore: 3.5,
          famachaScore: 2,
          fecalEggCount: 150,
          ultrasoundResult: 'Positive',
          ultrasoundFetalCount: 4,
          notes: 'Clean recheck',
          createdAt: '2026-09-05T12:00:00.000Z',
          updatedAt: '2026-09-05T12:00:00.000Z',
        },
      ],
    });

    const json = exportBarnBackupJson(snap);
    const restored = parseBarnBackupJson(json, makeSettings());

    expect(restored.settings.currencyCode).toBe('CAD');
    expect(restored.speciesProfiles[0]?.maturityDays).toBe(180);

    const restoredSold = restored.animals.find((a) => a.id === 'a-sold');
    expect(restoredSold?.ownershipType).toBe('Owned');
    expect(restoredSold?.soldDateIso).toBe('2026-10-12');
    expect(restoredSold?.salePriceCents).toBe(12500);
    expect(restoredSold?.purchaseCostCents).toBe(4500);
    expect(restoredSold?.buyerName).toBe('Willow Creek Rabbitry');

    const restoredRef = restored.animals.find((a) => a.id === 'a-ref');
    expect(restoredRef?.ownershipType).toBe('Reference');
    expect(restoredRef?.culled).toBe(true);
    expect(restoredRef?.cullDateIso).toBe('2026-09-01');
    expect(restoredRef?.cullReason).toBe('Disposition / Pedigree only');
    expect(restoredRef?.deceasedDateIso).toBe('2026-11-01');
    expect(restoredRef?.deathCause).toBe('Age');

    expect(restored.breedings[0]?.serviceFeeCents).toBe(3500);
    expect(restored.breedings[0]?.serviceFeeDirection).toBe('earned');
    expect(restored.breedings[0]?.ultrasoundResult).toBe('Positive');
    expect(restored.breedings[0]?.ultrasoundFetalCount).toBe(6);
    expect(restored.breedings[0]?.ultrasoundProjectedDueIso).toBe('2026-10-10');

    expect(restored.careLogs[0]?.medicationName).toBe('Ivermectin');
    expect(restored.careLogs[0]?.dosage).toBe('0.2 mL');
    expect(restored.careLogs[0]?.administrationRoute).toBe('SubQ');
    expect(restored.careLogs[0]?.withdrawalDays).toBe(28);
    expect(restored.careLogs[0]?.withdrawalClearDateIso).toBe('2026-10-03');
    expect(restored.careLogs[0]?.bodyConditionScore).toBe(3.5);
    expect(restored.careLogs[0]?.famachaScore).toBe(2);
    expect(restored.careLogs[0]?.fecalEggCount).toBe(150);

    const merged = mergeBarnSnapshots(makeEmptySnapshot(), restored);
    expect(merged.snapshot.animals).toHaveLength(2);
    expect(merged.snapshot.breedings[0]?.serviceFeeCents).toBe(3500);
  });

  it('normalizes legacy v3/v4/v5 backups missing the new Phase 1 fields safely', () => {
    const legacyJson = JSON.stringify({
      version: 4,
      settings: { barnName: 'Legacy Barn', preferredUnit: 'lbs_oz' },
      animals: [
        {
          id: 'leg-1',
          name: 'Legacy Doe',
          species: 'Rabbit',
          sex: 'Female',
          status: 'Active',
        },
      ],
      breedings: [{ id: 'b-leg', species: 'Rabbit', status: 'Bred' }],
      careLogs: [{ id: 'c-leg', animalId: 'leg-1', type: 'Weight Check', weightGrams: 3200 }],
    });

    const parsed = parseBarnBackupJson(legacyJson, makeSettings());
    expect(parsed.settings.currencyCode).toBe('USD');
    expect(parsed.animals[0]?.ownershipType).toBe('Owned');
    expect(parsed.animals[0]?.culled).toBe(false);
    expect(parsed.animals[0]?.salePriceCents).toBe(0);
    expect(parsed.breedings[0]?.serviceFeeDirection).toBe('none');
    expect(parsed.breedings[0]?.ultrasoundResult).toBe('');
    expect(parsed.careLogs[0]?.withdrawalDays).toBe(0);
    expect(parsed.careLogs[0]?.medicationName).toBe('');
  });

  it('appends new ownership/cull/sale/mortality columns to CSV export and preserves PDF DTO + conflict merge fields', () => {
    const animal = makeAnimal('c1', {
      name: 'Show Sale Doe',
      tattoo: 'SS-1',
      status: 'Sold',
      archived: true,
      ownershipType: 'Outside',
      culled: true,
      cullDateIso: '2026-10-01',
      cullReason: 'Age',
      soldDateIso: '2026-10-05',
      salePriceCents: 9500,
      buyerName: 'Alex',
      deceasedDateIso: '',
      deathCause: '',
    });

    const snap = makeEmptySnapshot({
      settings: makeSettings({ currencyCode: 'USD' }),
      animals: [animal],
    });

    const csv = exportAnimalsCsv(snap.animals, snap.speciesProfiles, snap.settings);
    const [headerLine, rowLine] = csv.split('\r\n');
    expect(headerLine.endsWith('Ownership,Culled,Cull_Date,Cull_Reason,Sold_Date,Sale_Price,Buyer,Deceased_Date,Death_Cause')).toBe(true);
    expect(rowLine).toContain('Outside,Yes,2026-10-01,Age,2026-10-05,$95.00,Alex,,');

    const pdf = buildPdfReadyBarnSnapshot(snap, 'Rabbit');
    expect(pdf.animals[0]?.ownershipType).toBe('Outside');
    expect(pdf.animals[0]?.culled).toBe(true);
    expect(pdf.animals[0]?.salePriceCents).toBe(9500);

    const incomingPartial = makeAnimal('c1', {
      name: 'Show Sale Doe Updated',
      weightGrams: 4200,
    });
    const resolved = resolveAnimalsWithConflictChoices([incomingPartial], snap, {});
    expect(resolved[0]?.ownershipType).toBe('Outside');
    expect(resolved[0]?.salePriceCents).toBe(9500);
    expect(resolved[0]?.buyerName).toBe('Alex');

    const baseUnculled = makeAnimal('c2', {
      name: 'Herd Buck',
      culled: false,
      salePriceCents: 0,
      purchaseCostCents: 0,
    });
    const incomingEnriched = makeAnimal('c2', {
      name: 'Herd Buck',
      culled: true,
      cullReason: 'Disposition',
      salePriceCents: 18500,
      purchaseCostCents: 4200,
    });
    const enrichedResolved = resolveAnimalsWithConflictChoices(
      [incomingEnriched],
      makeEmptySnapshot({ animals: [baseUnculled] }),
      {}
    );
    expect(enrichedResolved[0]?.culled).toBe(true);
    expect(enrichedResolved[0]?.cullReason).toBe('Disposition');
    expect(enrichedResolved[0]?.salePriceCents).toBe(18500);
    expect(enrichedResolved[0]?.purchaseCostCents).toBe(4200);
  });

  it('classifies non-adults and formats currencies/normalizers purely', () => {
    const rabbitProfile = { ...makeSpeciesProfile('Rabbit'), weanDaysAfterBirth: 42, maturityDays: 150 };
    expect(isAnimalNonAdult({ status: 'Junior', birthDateIso: '2024-01-01' }, rabbitProfile, '2026-11-16')).toBe(true);
    expect(isAnimalNonAdult({ status: 'Active', birthDateIso: '2026-09-01' }, rabbitProfile, '2026-11-16')).toBe(true);
    expect(isAnimalNonAdult({ status: 'Active', birthDateIso: '2025-01-01' }, rabbitProfile, '2026-11-16')).toBe(false);

    expect(formatCurrencyCents(12550, 'USD')).toBe('$125.50');
    expect(normalizeOwnershipType('pedigree reference')).toBe('Reference');
    expect(normalizeUltrasoundResult('pregnant')).toBe('Positive');
  });
});
