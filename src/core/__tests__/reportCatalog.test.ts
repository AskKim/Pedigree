/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { buildReportCatalogForSpecies } from '../reportCatalog';
import { makeSpeciesProfile } from './testFixtures';

describe('buildReportCatalogForSpecies', () => {
  it('uses universal Male, Female, and Non-Adults wording across species', () => {
    const goatCatalog = buildReportCatalogForSpecies(makeSpeciesProfile('Goat'));
    const titles = goatCatalog.map((e) => e.title);

    expect(titles).toContain('Male Income Report');
    expect(titles).toContain('Female Income Report');
    expect(titles).toContain('Male Report');
    expect(titles).toContain('Female Report');
    expect(titles).toContain('Non-Adults (Male & Female) Report');
    expect(titles).toContain('Body Condition & Parasite Score Report');

    // No hardcoded Buck / Doe / Kid / Herd / FAMACHA titles
    for (const title of titles) {
      expect(title).not.toMatch(/\b(Buck|Doe|Kid|Herd|FAMACHA)\b/);
    }
    expect(goatCatalog.every((e) => e.scopeLabel === 'Goat Only')).toBe(true);
  });

  it('adapts birth event and identifier terminology strictly to each added species', () => {
    const dogCatalog = buildReportCatalogForSpecies(makeSpeciesProfile('Dog'));
    const dogMarksCal = dogCatalog.find((e) => e.id === 'birth-calendar-marks');
    const dogMissingId = dogCatalog.find((e) => e.id === 'unmarked-report');

    expect(dogMarksCal?.title).toBe('Whelping Calendar (By ID)');
    expect(dogMarksCal?.description).toContain('id / microchip');
    expect(dogMissingId?.description).toContain('id / microchip');
    expect(dogCatalog.every((e) => e.scopeLabel === 'Dog Only')).toBe(true);

    // Ensure Dog catalog contains zero goat/rabbit terminology
    for (const entry of dogCatalog) {
      expect(`${entry.title} ${entry.description}`).not.toMatch(/\b(kidding|kindling|buck|doe)\b/i);
    }
  });

  it('supports custom user-defined species profiles without leaking other species labels', () => {
    const customProfile = {
      ...makeSpeciesProfile('Rabbit'),
      id: 'species-custom-quail',
      name: 'Quail',
      birthEventLabel: 'Hatching',
      maleLabel: 'Rooster',
      femaleLabel: 'Hen',
      offspringLabel: 'Chick',
    };
    const quailCatalog = buildReportCatalogForSpecies(customProfile);
    expect(quailCatalog).toHaveLength(23);
    expect(quailCatalog[0].title).toBe('Hatching Calendar (By ID)');
    expect(quailCatalog.every((e) => e.scopeLabel === 'Quail Only')).toBe(true);
  });
});
