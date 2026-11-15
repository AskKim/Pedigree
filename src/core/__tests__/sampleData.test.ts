import { describe, expect, it } from 'vitest';
import { inferHiddenAlleles } from '../geneticsEngine';
import { isAnimalArchived, PREDEFINED_SPECIES_PRESETS } from '../models';
import { buildPedigreeSlots, buildSpeciesHerdMap, calculateAnimalCoi } from '../pedigreeCalculator';
import {
  buildFullPredefinedSampleSnapshot,
  buildSampleDataForSpecies,
  countAllSpeciesRecords,
  isSampleTestingId,
  purgeSpeciesTestingDataPure,
} from '../sampleData';

describe('sampleData 6-generation pedigree seeding', () => {
  it('gives about half of active animals a full 6-gen pedigree across all 9 species using inactive ancestors', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();

    for (const preset of PREDEFINED_SPECIES_PRESETS) {
      const herdById = buildSpeciesHerdMap(snapshot.animals, preset.name);
      const speciesAnimals = Array.from(herdById.values());
      const activeAnimals = speciesAnimals.filter((a) => !isAnimalArchived(a));
      const inactiveAnimals = speciesAnimals.filter((a) => isAnimalArchived(a));

      expect(activeAnimals.length).toBeGreaterThanOrEqual(5);
      expect(inactiveAnimals.length).toBeGreaterThan(100);

      const fullSixGenActive = activeAnimals.filter((a) => {
        const slots = buildPedigreeSlots(a, herdById, 6);
        const filledAncestors = slots.filter((s) => s.generation > 0 && s.animal !== null).length;
        return filledAncestors === 126;
      });

      const ratio = fullSixGenActive.length / activeAnimals.length;
      expect(ratio).toBeGreaterThanOrEqual(0.5);
      expect(ratio).toBeLessThanOrEqual(0.6);

      // Every generated animal must carry a seed- ID so Delete Testing Data removes it cleanly
      expect(speciesAnimals.every((a) => isSampleTestingId(a.id))).toBe(true);
    }
  });

  it('keeps Rabbit 12.5% COI and produces zero genetic conflicts on seeded animals', () => {
    const bundle = buildSampleDataForSpecies('Rabbit');
    expect(bundle).not.toBeNull();
    const herdById = buildSpeciesHerdMap(bundle!.animals, 'Rabbit');
    const jrFemale = bundle!.animals.find((a) => a.id === 'seed-rabbit-jr-female')!;
    const coi = calculateAnimalCoi(jrFemale, herdById);
    expect(coi.coiPercent).toBeCloseTo(12.5, 2);

    for (const animal of bundle!.animals) {
      const genetics = inferHiddenAlleles(animal, herdById, bundle!.animals);
      expect(genetics.conflicts).toEqual([]);
    }
  });

  it('supports custom species sample data with full 6-gen pedigrees and clean testing-data purge', () => {
    const bundle = buildSampleDataForSpecies('Quail');
    expect(bundle).not.toBeNull();
    const herdById = buildSpeciesHerdMap(bundle!.animals, 'Quail');
    const active = bundle!.animals.filter((a) => !isAnimalArchived(a));
    const fullCount = active.filter((a) => {
      const slots = buildPedigreeSlots(a, herdById, 6);
      return slots.filter((s) => s.generation > 0 && s.animal !== null).length === 126;
    }).length;
    expect(fullCount).toBe(3);
    expect(active.length).toBe(6);

    const base = buildFullPredefinedSampleSnapshot();
    const purged = purgeSpeciesTestingDataPure(base, 'Rabbit');
    expect(countAllSpeciesRecords(purged.nextSnapshot, 'Rabbit')).toBe(0);
    expect(countAllSpeciesRecords(purged.nextSnapshot, 'Goat')).toBeGreaterThan(0);
  });
});
