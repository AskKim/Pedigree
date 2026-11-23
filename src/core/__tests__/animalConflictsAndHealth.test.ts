import { describe, expect, it } from 'vitest';
import {
  analyzeBarnAnimalConflicts,
  applyImportConflictAttentionFlags,
  findAllSpeciesDuplicateTattooPeers,
  findLitterOffspringTattooConflicts,
  findOffspringRequiringParentSex,
  findSameSexDuplicateTattooCollisions,
  getConflictSortPriority,
  isOverrideConfirmationValid,
} from '../animalConflicts';
import { analyzeBarnDataHealth, repairBarnDataHealth } from '../dataHealthCheck';
import { makeAnimal, makeEmptySnapshot, makeSpeciesProfile } from './testFixtures';

describe('animalConflicts & dataHealthCheck — conflict detection, override guard, import flags & non-destructive health warnings', () => {
  it('validates the case-insensitive override confirmation string cleanly', () => {
    expect(isOverrideConfirmationValid('override')).toBe(true);
    expect(isOverrideConfirmationValid('  OverRide  ')).toBe(true);
    expect(isOverrideConfirmationValid('')).toBe(false);
    expect(isOverrideConfirmationValid('yes')).toBe(false);
    expect(isOverrideConfirmationValid('overrid')).toBe(false);
  });

  it('detects same-species same-sex duplicate tattoos on single animal creation while ignoring other species or opposite sex', () => {
    const animals = [
      makeAnimal('r-buck-1', { species: 'Rabbit', sex: 'Male', tattoo: 'MB-101' }),
      makeAnimal('r-doe-1', { species: 'Rabbit', sex: 'Female', tattoo: 'MB-102' }),
      makeAnimal('s-buck-1', { species: 'Sheep', sex: 'Male', tattoo: 'MB-101' }),
    ];

    expect(
      findSameSexDuplicateTattooCollisions({
        tattoo: ' mb-101 ',
        sex: 'Male',
        species: 'Rabbit',
        animals,
      }).map((a) => a.id)
    ).toEqual(['r-buck-1']);

    // Opposite sex in same species does not block creation collision check
    expect(
      findSameSexDuplicateTattooCollisions({
        tattoo: 'MB-101',
        sex: 'Female',
        species: 'Rabbit',
        animals,
      })
    ).toHaveLength(0);

    // Editing the existing animal excludes itself
    expect(
      findSameSexDuplicateTattooCollisions({
        tattoo: 'MB-101',
        sex: 'Male',
        species: 'Rabbit',
        animals,
        excludeAnimalIds: ['r-buck-1'],
      })
    ).toHaveLength(0);

    // Informational all-sex same-species check catches both sexes within Rabbit only
    expect(
      findAllSpeciesDuplicateTattooPeers({
        tattoo: 'MB-101',
        species: 'Rabbit',
        animals,
      }).map((a) => a.id)
    ).toEqual(['r-buck-1']);
  });

  it('detects bulk litter offspring tattoo conflicts against existing herd AND intra-litter drafts', () => {
    const existing = [
      makeAnimal('r-buck', { species: 'Rabbit', sex: 'Male', tattoo: 'K-01' }),
    ];

    const conflicts = findLitterOffspringTattooConflicts(
      [
        { index: 0, name: 'Kit 1', tattoo: 'k-01', sex: 'Male' }, // collides with existing r-buck
        { index: 1, name: 'Kit 2', tattoo: 'K-02', sex: 'Female' }, // intra-batch duplicate with index 2
        { index: 2, name: 'Kit 3', tattoo: ' k-02 ', sex: 'Female' }, // intra-batch duplicate with index 1
        { index: 3, name: 'Kit 4', tattoo: 'K-02', sex: 'Male' }, // different sex, no same-sex collision
      ],
      'Rabbit',
      existing
    );

    expect(conflicts).toHaveLength(3);
    expect(conflicts[0].rowIndex).toBe(0);
    expect(conflicts[0].existingMatches.map((a) => a.id)).toEqual(['r-buck']);
    expect(conflicts[1].rowIndex).toBe(1);
    expect(conflicts[1].batchPeerIndices).toEqual([2]);
    expect(conflicts[2].rowIndex).toBe(2);
    expect(conflicts[2].batchPeerIndices).toEqual([1]);
  });

  it('identifies dependent offspring before changing an animal sex to prevent parent sex mismatches', () => {
    const animals = [
      makeAnimal('sire-1', { species: 'Rabbit', sex: 'Male' }),
      makeAnimal('dam-1', { species: 'Rabbit', sex: 'Female' }),
      makeAnimal('kit-1', { species: 'Rabbit', sireId: 'sire-1', damId: 'dam-1' }),
      makeAnimal('sheep-1', { species: 'Sheep', sireId: 'sire-1', damId: 'dam-1' }),
    ];

    const deps = findOffspringRequiringParentSex('sire-1', 'Rabbit', animals);
    expect(deps.asSireOf.map((a) => a.id)).toEqual(['kit-1']);
    expect(deps.asDamOf).toHaveLength(0);
  });

  it('flags imported animals & colliding peers for review without blocking imports and respects ignored conflict kinds', () => {
    const existingBuck = makeAnimal('existing-buck', {
      species: 'Rabbit',
      sex: 'Male',
      tattoo: 'DUP-9',
      needsAttention: false,
    });
    const importedDupBuck = makeAnimal('imp-buck', {
      species: 'Rabbit',
      sex: 'Male',
      tattoo: 'DUP-9',
      needsAttention: false,
    });
    const importedFemaleSire = makeAnimal('imp-female-sire', {
      species: 'Rabbit',
      sex: 'Female',
      tattoo: 'FS-1',
    });
    const importedWrongKid = makeAnimal('imp-kid', {
      species: 'Rabbit',
      sex: 'Female',
      tattoo: 'KID-1',
      sireId: 'imp-female-sire',
      needsAttention: false,
    });

    const flagResult = applyImportConflictAttentionFlags(
      [existingBuck, importedDupBuck, importedFemaleSire, importedWrongKid],
      new Set(['imp-buck', 'imp-female-sire', 'imp-kid'])
    );

    expect(flagResult.conflictedAnimalIds.sort()).toEqual(['existing-buck', 'imp-buck', 'imp-kid']);
    expect(flagResult.newlyFlaggedIds.sort()).toEqual(['existing-buck', 'imp-buck', 'imp-kid']);
    expect(flagResult.duplicateTattooAnimalCount).toBe(2);
    expect(flagResult.parentSexMismatchAnimalCount).toBe(1);
    expect(flagResult.alertMessage).toContain('3 record(s) needing review');

    const flaggedMap = new Map(flagResult.animals.map((a) => [a.id, a]));
    expect(flaggedMap.get('existing-buck')?.needsAttention).toBe(true);
    expect(flaggedMap.get('imp-buck')?.needsAttention).toBe(true);
    expect(flaggedMap.get('imp-kid')?.needsAttention).toBe(true);

    // Ignoring conflicts keeps soft warning while dropping active conflict & sort priority
    const ignoredKid = {
      ...flaggedMap.get('imp-kid')!,
      needsAttention: false,
      ignoredConflicts: ['parent_sex_mismatch' as const],
    };
    const summaries = analyzeBarnAnimalConflicts([
      flaggedMap.get('existing-buck')!,
      flaggedMap.get('imp-buck')!,
      importedFemaleSire,
      ignoredKid,
    ]);

    const activeSummary = summaries.get('imp-buck');
    const ignoredSummary = summaries.get('imp-kid');
    const cleanSummary = summaries.get('imp-female-sire');

    expect(activeSummary?.hasActiveConflict).toBe(true);
    expect(activeSummary?.isIgnoredWithSoftWarning).toBe(false);
    expect(getConflictSortPriority(activeSummary)).toBe(0);

    expect(ignoredSummary?.hasAnyConflict).toBe(true);
    expect(ignoredSummary?.hasActiveConflict).toBe(false);
    expect(ignoredSummary?.isIgnoredWithSoftWarning).toBe(true);
    expect(getConflictSortPriority(ignoredSummary)).toBe(1);

    expect(cleanSummary?.hasAnyConflict).toBe(false);
    expect(getConflictSortPriority(cleanSummary)).toBe(2);
  });

  it('reports within-species duplicate tattoos and parent sex mismatches in database health checks without destroying any data on repair', () => {
    const femaleAsSire = makeAnimal('sire-wrong', {
      species: 'Rabbit',
      sex: 'Female',
      tattoo: 'F-1',
    });
    const maleAsDam = makeAnimal('dam-wrong', {
      species: 'Rabbit',
      sex: 'Male',
      tattoo: 'M-1',
    });
    const unknownAsSire = makeAnimal('sire-unknown', {
      species: 'Rabbit',
      sex: 'Unknown',
      tattoo: 'U-1',
    });
    const kitBadParents = makeAnimal('kit-bad', {
      species: 'Rabbit',
      sex: 'Female',
      tattoo: 'DUP-77',
      sireId: 'sire-wrong',
      damId: 'dam-wrong',
    });
    const kitUnknownSire = makeAnimal('kit-unk', {
      species: 'Rabbit',
      sex: 'Male',
      tattoo: 'dup-77',
      sireId: 'sire-unknown',
    });
    const sheepSameTattoo = makeAnimal('sheep-ok', {
      species: 'Sheep',
      sex: 'Male',
      tattoo: 'DUP-77',
    });

    const snapshot = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')],
      animals: [
        femaleAsSire,
        maleAsDam,
        unknownAsSire,
        kitBadParents,
        kitUnknownSire,
        sheepSameTattoo,
      ],
    });

    const report = analyzeBarnDataHealth(snapshot);
    const dupIssue = report.issues.find((i) => i.code === 'DUPLICATE_SPECIES_TATTOO');
    const sexIssue = report.issues.find((i) => i.code === 'PARENT_SEX_MISMATCH');

    expect(dupIssue).toBeDefined();
    expect(dupIssue?.severity).toBe('warn');
    expect(dupIssue?.autoRepairable).toBe(false);
    expect(dupIssue?.count).toBe(1); // 1 group within Rabbit ("DUP-77"), ignoring Sheep

    expect(sexIssue).toBeDefined();
    expect(sexIssue?.severity).toBe('warn');
    expect(sexIssue?.autoRepairable).toBe(false);
    expect(sexIssue?.count).toBe(3); // female sire, male dam, unknown sire
    expect(sexIssue?.title).toContain('1 female recorded as Sire');
    expect(sexIssue?.title).toContain('1 male recorded as Dam');
    expect(sexIssue?.title).toContain('1 Unknown-sex parent link(s)');

    // Non-destructive health repair leaves warning-only parent links & duplicate tattoos intact
    const repaired = repairBarnDataHealth(snapshot);
    expect(repaired.nextSnapshot.animals).toHaveLength(6);
    const repairedKit = repaired.nextSnapshot.animals.find((a) => a.id === 'kit-bad');
    expect(repairedKit?.sireId).toBe('sire-wrong');
    expect(repairedKit?.damId).toBe('dam-wrong');
  });
});
