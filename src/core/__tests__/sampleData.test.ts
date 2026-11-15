import { describe, expect, it } from 'vitest';
import {
  evaluateSpeciesArrivingBabiesAlert,
  evaluateSpeciesDueTasksAlert,
} from '../barnAlerts';
import { inferHiddenAlleles } from '../geneticsEngine';
import { isAnimalArchived, PREDEFINED_SPECIES_PRESETS, todayDateIso } from '../models';
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

  it('seeds a dynamic overdue task and due-soon pregnancy per species so restoring sample data always triggers alerts', () => {
    const today = todayDateIso();
    const snapshot = buildFullPredefinedSampleSnapshot(undefined, today);

    for (const profile of snapshot.speciesProfiles) {
      const dueAlert = evaluateSpeciesDueTasksAlert(snapshot.tasks, profile.name, {
        todayIso: today,
      });
      expect(dueAlert.shouldShow).toBe(true);
      expect(dueAlert.overdueCount).toBeGreaterThanOrEqual(1);
      expect(dueAlert.tasks.every((t) => isSampleTestingId(t.id))).toBe(true);

      const arrivalAlert = evaluateSpeciesArrivingBabiesAlert(snapshot.breedings, profile, {
        todayIso: today,
      });
      expect(arrivalAlert.shouldShow).toBe(true);
      expect(arrivalAlert.items.length).toBeGreaterThanOrEqual(1);
      expect(isSampleTestingId(arrivalAlert.items[0].breeding.id)).toBe(true);
    }

    // Simulate restoring sample data years later when old dates would otherwise have become stale/past
    const futureRestoreDate = '2029-07-04';
    const restoredLater = buildFullPredefinedSampleSnapshot(undefined, futureRestoreDate);
    for (const profile of restoredLater.speciesProfiles) {
      const dueAlert = evaluateSpeciesDueTasksAlert(restoredLater.tasks, profile.name, {
        todayIso: futureRestoreDate,
      });
      expect(dueAlert.shouldShow).toBe(true);
      expect(dueAlert.overdueCount).toBeGreaterThanOrEqual(1);

      const arrivalAlert = evaluateSpeciesArrivingBabiesAlert(restoredLater.breedings, profile, {
        todayIso: futureRestoreDate,
      });
      expect(arrivalAlert.shouldShow).toBe(true);
      expect(arrivalAlert.items[0].daysUntilDue).toBeGreaterThanOrEqual(0);
      expect(arrivalAlert.items[0].daysUntilDue).toBeLessThanOrEqual(arrivalAlert.windowDays);
    }

    // Custom species sample data also carries both dynamic alerts
    const customBundle = buildSampleDataForSpecies('Quail', undefined, futureRestoreDate)!;
    const customDue = evaluateSpeciesDueTasksAlert(customBundle.tasks, 'Quail', {
      todayIso: futureRestoreDate,
    });
    const customArrival = evaluateSpeciesArrivingBabiesAlert(
      customBundle.breedings,
      customBundle.speciesProfile,
      { todayIso: futureRestoreDate }
    );
    expect(customDue.shouldShow).toBe(true);
    expect(customDue.overdueCount).toBeGreaterThanOrEqual(1);
    expect(customArrival.shouldShow).toBe(true);
    expect(customArrival.items.length).toBeGreaterThanOrEqual(1);
  });
});
