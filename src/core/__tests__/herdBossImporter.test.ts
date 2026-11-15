import { describe, expect, it } from 'vitest';
import { HerdBossImporter } from '../importers/herdBossImporter';
import { isAnimalActive, isAnimalArchived, normalizeAnimalStatus } from '../models';
import { makeEmptySnapshot } from './testFixtures';

function encodeCsv(csv: string): Uint8Array {
  return new TextEncoder().encode(csv);
}

describe('herdBossImporter & AnimalStatus archive detection', () => {
  it('normalizes active, junior, and inactive/archived import statuses consistently', () => {
    expect(normalizeAnimalStatus('Active')).toBe('Active');
    expect(normalizeAnimalStatus('Weanling')).toBe('Junior');
    expect(normalizeAnimalStatus('Inactive')).toBe('Archived');
    expect(normalizeAnimalStatus('Not Active')).toBe('Archived');
    expect(normalizeAnimalStatus('Sold')).toBe('Sold');
    expect(normalizeAnimalStatus('Deceased')).toBe('Deceased');
    expect(normalizeAnimalStatus('Reference Ancestor')).toBe('Retired');

    expect(isAnimalActive({ status: 'Active' })).toBe(true);
    expect(isAnimalActive({ status: 'Junior' })).toBe(true);
    expect(isAnimalArchived({ status: 'Archived' })).toBe(true);
    expect(isAnimalArchived({ status: 'Sold' })).toBe(true);
    expect(isAnimalArchived({ status: 'Deceased' })).toBe(true);
    expect(isAnimalArchived({ status: 'Retired' })).toBe(true);
  });

  it('detects Archived/Sold/Deceased/Active flags and resolves sire/dam pedigrees on CSV import', () => {
    const csv = [
      'ID,Species,Name,Tag,Sex,Status,Archived,Active,Sold_Date,Death_Date,Birth_Date,Weight,Sire,Dam',
      '101,Rabbit,Founder Buck,FB1,Buck,Active,false,true,,,2022-03-01,9.5,,',
      '102,Rabbit,Past Doe,PD2,Doe,,true,,,,2022-04-10,10.0,,',
      '103,Rabbit,Inactive Doe,ID3,Doe,,false,false,,,2023-01-12,9.2,FB1,PD2',
      '104,Rabbit,Market Kit,MK4,Buck,Active,,,2025-05-01,,2025-02-01,5.0,FB1,ID3',
      '105,Rabbit,Lost Kit,LK5,Doe,,,,2024-06-01,2024-08-01,2024-03-01,4.1,FB1,PD2',
      '106,Alpaca,Andean Star,AS6,Macho,Active,false,true,,,2023-07-07,135,,',
    ].join('\n');

    const snapshot = makeEmptySnapshot();
    const preview = HerdBossImporter.parse(
      [{ fileName: 'animals.csv', bytes: encodeCsv(csv) }],
      snapshot,
      { fallbackSpeciesName: 'Rabbit' }
    );

    expect(preview.animals).toHaveLength(6);
    expect(preview.speciesDetected).toContain('Rabbit');
    expect(preview.speciesDetected).toContain('Alpaca');
    expect(preview.newSpeciesProfiles.some((p) => p.name === 'Alpaca')).toBe(true);

    const byName = new Map(preview.animals.map((a) => [a.name, a]));
    expect(byName.get('Founder Buck')?.status).toBe('Active');
    expect(byName.get('Founder Buck')?.sex).toBe('Male');

    expect(byName.get('Past Doe')?.status).toBe('Archived');
    expect(isAnimalArchived(byName.get('Past Doe')!)).toBe(true);

    expect(byName.get('Inactive Doe')?.status).toBe('Archived');
    expect(byName.get('Inactive Doe')?.sireId).toBe(byName.get('Founder Buck')?.id);
    expect(byName.get('Inactive Doe')?.damId).toBe(byName.get('Past Doe')?.id);

    expect(byName.get('Market Kit')?.status).toBe('Sold');
    expect(byName.get('Lost Kit')?.status).toBe('Deceased');
    expect(byName.get('Andean Star')?.sex).toBe('Male');
    expect(preview.parentLinksResolved).toBeGreaterThanOrEqual(6);
  });
});
