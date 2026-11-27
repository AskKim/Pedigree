import { describe, expect, it } from 'vitest';
import {
  buildCleanCsvExportFileName,
  escapeCsvCell,
  exportAnimalsCsv,
  formatParentReferenceForCsv,
  UTF8_BOM,
} from '../csvExport';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('csvExport — human-readable UTF-8 BOM spreadsheet export', () => {
  it('prepends a UTF-8 BOM and resolves parent UUIDs to readable names and tattoos', () => {
    const sireId = '550e8400-e29b-41d4-a716-446655440001';
    const damId = '550e8400-e29b-41d4-a716-446655440002';
    const kitId = '550e8400-e29b-41d4-a716-446655440003';

    const sire = makeAnimal(sireId, {
      name: 'Copper Creek Firestorm',
      tattoo: 'NZR-201',
      species: 'Rabbit',
      sex: 'Male',
      status: 'Retired',
      archived: true,
    });
    const dam = makeAnimal(damId, {
      name: 'Crimson Clover',
      tattoo: 'NZR-202',
      species: 'Rabbit',
      sex: 'Female',
    });
    const kit = makeAnimal(kitId, {
      name: 'Ruby Rose',
      tattoo: 'NZR-301',
      species: 'Rabbit',
      breed: 'New Zealand',
      variety: 'Red',
      sex: 'Female',
      status: 'Junior',
      birthDateIso: '2026-08-10',
      sireId,
      damId,
      notes: 'Show prospect, gentle\nLine 2 "quoted"',
    });

    const snap = makeEmptySnapshot({
      animals: [kit, dam, sire],
      speciesProfiles: [makeSpeciesProfile('Rabbit')],
      settings: makeSettings({ preferredUnit: 'lbs_oz' }),
    });

    const csv = exportAnimalsCsv(snap.animals, snap.speciesProfiles, snap.settings);

    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    // Raw internal parent UUIDs must never leak into the spreadsheet
    expect(csv).not.toContain(sireId);
    expect(csv).not.toContain(damId);
    // Resolved parent names & tattoos must appear cleanly
    expect(csv).toContain('Copper Creek Firestorm (NZR-201),NZR-201,Crimson Clover (NZR-202),NZR-202');
    // Multi-line notes with commas and quotes are RFC-4180 escaped inside one cell
    expect(csv).toContain('"Show prospect, gentle\nLine 2 ""quoted"""');
  });

  it('handles missing/unlinked parent IDs and CRLF line breaks gracefully', () => {
    expect(formatParentReferenceForCsv(undefined, '')).toBe('');
    expect(formatParentReferenceForCsv(undefined, 'orphan-uuid-999')).toBe('Unknown / Unlinked');
    expect(escapeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });

  it('builds clean dated CSV export filenames from barn name and optional species', () => {
    expect(buildCleanCsvExportFileName('My Barn', undefined, '2026-11-16')).toBe(
      'pedigree-export-2026-11-16.csv'
    );
    expect(buildCleanCsvExportFileName('Copper Creek Barn', undefined, '2026-11-16')).toBe(
      'copper-creek-barn-export-2026-11-16.csv'
    );
    expect(buildCleanCsvExportFileName('My Barn', 'Rabbit', '2026-11-16')).toBe(
      'pedigree-rabbit-export-2026-11-16.csv'
    );
  });
});
