import { describe, expect, it } from 'vitest';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import {
  expandPedigreeFamilyInSpecies,
  migrateAnimalsToSpecies,
} from '../speciesMigration';
import { makeAnimal, makeEmptySnapshot, makeSpeciesProfile } from './testFixtures';

describe('speciesMigration — family expansion & cross-species migrations', () => {
  it('expands pedigree family upward, downward, and across co-parents within the source species only', () => {
    const gSire = makeAnimal('gs', { species: 'Sheep', sex: 'Male' });
    const sire = makeAnimal('s', { species: 'Sheep', sex: 'Male', sireId: 'gs' });
    const dam = makeAnimal('d', { species: 'Sheep', sex: 'Female' });
    const kid = makeAnimal('k', { species: 'Sheep', sex: 'Male', sireId: 's', damId: 'd' });
    const otherMate = makeAnimal('m2', { species: 'Sheep', sex: 'Female' });
    const grandKid = makeAnimal('gk', { species: 'Sheep', sex: 'Female', sireId: 'k', damId: 'm2' });
    const unrelatedSheep = makeAnimal('u', { species: 'Sheep', sex: 'Male' });
    const rabbit = makeAnimal('r1', { species: 'Rabbit', sex: 'Male' });

    const all = [gSire, sire, dam, kid, otherMate, grandKid, unrelatedSheep, rabbit];
    const expansion = expandPedigreeFamilyInSpecies(all, ['k'], 'Sheep');

    expect(expansion.directIds).toEqual(['k']);
    expect(expansion.ancestorIds.sort()).toEqual(['d', 'gs', 's']);
    expect(expansion.descendantIds).toEqual(['gk']);
    expect(expansion.linkedCoParentAndRelativeIds).toEqual(['m2']);
    expect(expansion.allExpandedIds.sort()).toEqual(['d', 'gk', 'gs', 'k', 'm2', 's']);
  });

  it('migrates partial selections while reconnecting pedigree links once parents follow', () => {
    const sire = makeAnimal('s', { species: 'Rabbit', sex: 'Male' });
    const dam = makeAnimal('d', { species: 'Rabbit', sex: 'Female' });
    const kid = makeAnimal('k', { species: 'Rabbit', sex: 'Male', sireId: 's', damId: 'd' });

    const snap1 = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Goat')],
      animals: [sire, dam, kid],
    });

    // Step 1: move only `k` to Goat -> parent UUIDs preserved, flagged as splitParentLinksCount = 1
    const pass1 = migrateAnimalsToSpecies(snap1, ['k'], 'Goat');
    expect(pass1.animalsMigrated).toBe(1);
    expect(pass1.splitParentLinksCount).toBe(1);
    expect(pass1.remainingSourceAnimalsCount).toBe(2);

    // Step 2: move `s` and `d` to Goat -> Goat pedigree tree automatically reconnects
    const pass2 = migrateAnimalsToSpecies(pass1.snapshot, ['s', 'd'], 'Goat');
    expect(pass2.animalsMigrated).toBe(2);
    expect(pass2.splitParentLinksCount).toBe(0);
    expect(pass2.remainingSourceAnimalsCount).toBe(0);

    const goatHerd = buildSpeciesHerdMap(pass2.snapshot.animals, 'Goat');
    expect(goatHerd.get('k')?.sireId).toBe('s');
    expect(goatHerd.get('k')?.damId).toBe('d');
  });

  it('migrates an entire species including Archived stock, photos, breedings, tasks, cages & shows', () => {
    const activeBuck = makeAnimal('ab', { species: 'Rabbit', sex: 'Male', status: 'Active' });
    const archivedDoe = makeAnimal('ad', { species: 'Rabbit', sex: 'Female', status: 'Archived' });
    const sheepBuck = makeAnimal('sb', { species: 'Sheep', sex: 'Male', status: 'Active' });

    const snap = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')],
      animals: [activeBuck, archivedDoe, sheepBuck],
      animalPhotos: [
        {
          id: 'ph1',
          species: 'Rabbit',
          animalId: 'ab',
          isPrimary: true,
          sortOrder: 0,
          caption: 'Front',
          originalFileName: 'a.jpg',
          mimeType: 'image/webp',
          width: 100,
          height: 100,
          originalBytes: 1000,
          storedBytes: 400,
          thumbnailDataUrl: 'data:image/webp;base64,AA==',
          dataUrl: 'data:image/webp;base64,AA==',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      breedings: [
        {
          id: 'br1',
          species: 'Rabbit',
          sireId: 'ab',
          damId: 'ad',
          sireName: activeBuck.name,
          damName: archivedDoe.name,
          bredDateIso: '2026-01-10',
          expectedDueDateIso: '2026-02-10',
          actualBirthDateIso: '',
          projectedCoiPercent: 0,
          liveCount: 0,
          stillbornCount: 0,
          fosteredCount: 0,
          weanedCount: 0,
          offspringCreated: false,
          status: 'Bred',
          notes: '',
          createdAt: '2026-01-10T00:00:00.000Z',
          updatedAt: '2026-01-10T00:00:00.000Z',
        },
      ],
      tasks: [
        {
          id: 't1',
          species: 'Rabbit',
          title: 'Palpate Doe',
          category: 'Palpation',
          priority: 'High',
          dueDateIso: '2026-01-24',
          linkedAnimalId: 'ad',
          linkedAnimalName: archivedDoe.name,
          linkedBreedingId: 'br1',
          completed: false,
          createdAt: '2026-01-10T00:00:00.000Z',
          updatedAt: '2026-01-10T00:00:00.000Z',
        },
      ],
      cages: [
        {
          id: 'cg1',
          species: 'Rabbit',
          label: 'R-1',
          section: 'Main',
          capacity: 1,
          notes: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      shows: [
        {
          id: 'sh1',
          species: 'Rabbit',
          name: 'Spring Fair',
          location: 'Fairgrounds',
          sanctioningBody: 'ARBA',
          eventDateIso: '2026-04-01',
          entryDeadlineIso: '2026-03-15',
          enteredAnimalIds: ['ab'],
          notes: '',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    // Migrate Rabbit -> Angora (creates custom target profile)
    const result = migrateAnimalsToSpecies(snap, [], 'Angora', {
      migrateEntireSpecies: true,
      sourceSpeciesName: 'Rabbit',
    });

    expect(result.createdTargetProfile).toBe(true);
    expect(result.animalsMigrated).toBe(2);
    expect(result.photosMigrated).toBe(1);
    expect(result.breedingsMigrated).toBe(1);
    expect(result.tasksMigrated).toBe(1);
    expect(result.cagesMigratedOrAdded).toBe(1);
    expect(result.showsUpdated).toBe(1);
    expect(result.remainingSourceRecordsCount).toBe(0);
    // Unrelated Sheep remains untouched
    expect(result.snapshot.animals.find((a) => a.id === 'sb')?.species).toBe('Sheep');
  });
});
