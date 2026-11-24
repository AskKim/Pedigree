import { describe, expect, it } from 'vitest';
import {
  computeMileageLogDeductionCents,
  evaluateAnnualMileageTaxSummary,
  exportMileageTaxCsv,
  generateAnnualMileageTaxHtml,
  getAvailableMileageTaxYears,
  normalizeMileageLog,
} from '../mileageTaxLog';
import { ClientContact, MileageLog, ShowEvent } from '../models';

describe('mileageTaxLog — IRS deduction math, annual summary & CSV/HTML exports', () => {
  const sampleLogs: MileageLog[] = [
    {
      id: 'ml-1',
      species: 'Rabbit',
      dateIso: '2026-04-12',
      purpose: 'Show Travel',
      origin: 'Home Barn',
      destination: 'Springfield Fairgrounds',
      roundTrip: true,
      miles: 120,
      odometerStart: 45100,
      odometerEnd: 45220,
      rateCentsPerMile: 70,
      parkingAndTollsCents: 1250,
      vehicleLabel: 'Barn Sprinter',
      linkedShowId: 'sh-1',
      taxDeductible: true,
      notes: 'State ARBA Spring Classic',
      createdAt: '2026-04-12T12:00:00Z',
      updatedAt: '2026-04-12T12:00:00Z',
    },
    {
      id: 'ml-2',
      species: 'Rabbit',
      dateIso: '2026-06-05',
      purpose: 'Delivery / Pickup',
      origin: 'Home Barn',
      destination: 'Meetup Exit 42',
      roundTrip: true,
      miles: 40,
      rateCentsPerMile: 70,
      parkingAndTollsCents: 0,
      linkedClientId: 'cl-1',
      taxDeductible: false,
      notes: 'Personal courtesy meetup (not claimed)',
      createdAt: '2026-06-05T12:00:00Z',
      updatedAt: '2026-06-05T12:00:00Z',
    },
    {
      id: 'ml-3',
      species: 'Rabbit',
      dateIso: '2025-11-18',
      purpose: 'Feed & Supply Run',
      origin: 'Home Barn',
      destination: 'Co-op Feed Mill',
      roundTrip: true,
      miles: 30,
      rateCentsPerMile: 67,
      parkingAndTollsCents: 0,
      taxDeductible: true,
      notes: '=cmd|calc!A1', // Test CSV formula injection mitigation
      createdAt: '2025-11-18T12:00:00Z',
      updatedAt: '2025-11-18T12:00:00Z',
    },
  ];

  it('normalizes malformed mileage inputs and calculates IRS mileage + tolls in integer cents', () => {
    expect(normalizeMileageLog({ id: '' })).toBeNull();
    const cleaned = normalizeMileageLog({
      id: 'ml-clean',
      species: 'Sheep',
      dateIso: '2026-05-01',
      purpose: 'Veterinary',
      origin: '  Barn\r\nGate ',
      destination: 'County Vet',
      roundTrip: 1,
      miles: 24.46,
      odometerStart: 1000.25,
      odometerEnd: 1024.75,
      rateCentsPerMile: 70,
      parkingAndTollsCents: 500,
      taxDeductible: true,
    });
    expect(cleaned).not.toBeNull();
    expect(cleaned?.origin).toBe('Barn Gate');
    expect(cleaned?.miles).toBe(24.5);

    const breakdown = computeMileageLogDeductionCents(sampleLogs[0]);
    expect(breakdown.mileageAllowanceCents).toBe(8400); // 120 * $0.70
    expect(breakdown.parkingAndTollsCents).toBe(1250);
    expect(breakdown.deductibleCents).toBe(9650);

    const nonDeductibleBreakdown = computeMileageLogDeductionCents(sampleLogs[1]);
    expect(nonDeductibleBreakdown.totalTripValueCents).toBe(2800);
    expect(nonDeductibleBreakdown.deductibleCents).toBe(0);
  });

  it('summarizes annual totals by year, purpose, and month while excluding non-deductible miles from tax totals', () => {
    expect(getAvailableMileageTaxYears(sampleLogs)).toEqual(['2026', '2025']);

    const summary2026 = evaluateAnnualMileageTaxSummary(sampleLogs, '2026');
    expect(summary2026.yearLabel).toBe('2026');
    expect(summary2026.totalTrips).toBe(2);
    expect(summary2026.deductibleTrips).toBe(1);
    expect(summary2026.totalMiles).toBe(160);
    expect(summary2026.deductibleMiles).toBe(120);
    expect(summary2026.nonDeductibleMiles).toBe(40);
    expect(summary2026.mileageDeductionCents).toBe(8400);
    expect(summary2026.parkingAndTollsCents).toBe(1250);
    expect(summary2026.totalDeductibleCents).toBe(9650);
    expect(summary2026.byPurpose).toHaveLength(2);
    expect(summary2026.byMonth.map((m) => m.monthKey)).toEqual(['2026-04', '2026-06']);
  });

  it('exports formula-safe UTF-8 CSV and XSS-escaped printable annual HTML reports', () => {
    const shows: ShowEvent[] = [
      {
        id: 'sh-1',
        species: 'Rabbit',
        name: 'Spring Classic <ARBA>',
        location: 'Columbus, OH',
        sanctioningBody: 'ARBA',
        eventDateIso: '2026-04-12',
        entryDeadlineIso: '2026-04-01',
        enteredAnimalIds: [],
        notes: '',
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      },
    ];
    const clients: ClientContact[] = [
      {
        id: 'cl-1',
        species: 'Rabbit',
        fullName: 'Alice <Buyer>',
        ranchOrHerdName: '',
        email: '',
        phone: '',
        preferredContact: 'email',
        clientKind: 'pet_buyer',
        cityState: '',
        shippingAddress: '',
        tags: [],
        notes: '',
        createdAt: '2026-04-01T00:00:00Z',
        updatedAt: '2026-04-01T00:00:00Z',
      },
    ];

    const csv = exportMileageTaxCsv({ logs: sampleLogs, shows, clients, currencyCode: 'USD' });
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Spring Classic <ARBA>');
    expect(csv).toContain('Alice <Buyer>');
    expect(csv).toContain("'=cmd|calc!A1");

    const xssLog: MileageLog = {
      ...sampleLogs[0],
      destination: '<script>alert(1)</script>Show Hall',
    };
    const html = generateAnnualMileageTaxHtml({
      logs: [xssLog],
      barnName: 'Meadowbrook <Farm>',
      breederName: 'Kim',
      speciesName: 'Rabbit',
      yearLabel: '2026',
      shows,
      clients,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Show Hall');
    expect(html).toContain('Meadowbrook &lt;Farm&gt;');
    expect(html).toContain('$96.50');
  });
});
