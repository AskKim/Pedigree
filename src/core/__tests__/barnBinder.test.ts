import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildCompleteBackupZipArchive, parseBackupArchiveInput } from '../backupArchive';
import {
  buildBarnBinderFileName,
  buildDefaultBarnBinderOptions,
  computeAnimalKinshipSummary,
  generateSpeciesBarnBinderHtml,
  resolveBinderPalette,
} from '../barnBinder';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('barnBinder — printable human-readable species binders & automatic ZIP inclusion', () => {
  it('enforces pure white #ffffff paper backgrounds even when Barn is in dark mode with custom Color Picker accents', () => {
    const paletteColor = resolveBinderPalette('color', {
      lightPrimary: '#9E3D22',
      lightAccent: '#6E4B26',
      lightMale: '#35607A',
      darkCanvas: '#0F1611',
      darkSurface: '#172219',
    });
    expect(paletteColor.paperBg).toBe('#FFFFFF');
    expect(paletteColor.primary).toBe('#9E3D22');
    expect(paletteColor.accent).toBe('#6E4B26');
    expect(paletteColor.male).toBe('#35607A');

    // Very light pastel Color Picker picks get automatically darkened for print legibility
    const pastelContrast = resolveBinderPalette('color', {
      lightPrimary: '#FFFFAA',
    });
    expect(pastelContrast.primary).not.toBe('#FFFFAA');

    const inkSaver = resolveBinderPalette('ink_saver', {
      lightPrimary: '#9E3D22',
    });
    expect(inkSaver.paperBg).toBe('#FFFFFF');
    expect(inkSaver.primary).toBe('#000000');

    const snap = makeEmptySnapshot({
      settings: makeSettings({
        themeMode: 'dark',
        customColors: {
          lightPrimary: '#9E3D22',
          lightAccent: '#6E4B26',
          lightMale: '#35607A',
          darkCanvas: '#0F1611',
          darkSurface: '#172219',
        },
      }),
      animals: [makeAnimal('r1', { name: 'Copper King', species: 'Rabbit', sex: 'Male' })],
    });

    const html = generateSpeciesBarnBinderHtml(snap, 'Rabbit', { colorMode: 'color' });
    expect(html).toContain('<meta name="color-scheme" content="light only" />');
    expect(html).toContain('<meta name="barn-preserve-accent-ink" content="true" />');
    expect(html).toContain('background: #ffffff;');
    expect(html).not.toContain('#0F1611');
    expect(html).not.toContain('#172219');

    const inkHtml = generateSpeciesBarnBinderHtml(snap, 'Rabbit', { colorMode: 'ink_saver' });
    expect(inkHtml).not.toContain('barn-preserve-accent-ink');
    expect(inkHtml).toContain('Ink Saver Monochrome');
  });

  it('inherits unset species preferences (weight unit, generations, barn & breeder names) from global BarnSettings', () => {
    const rabbitProfile = makeSpeciesProfile('Rabbit');
    rabbitProfile.preferredUnit = undefined;
    const snap = makeEmptySnapshot({
      settings: makeSettings({
        barnName: 'Cedar Ridge Barn',
        breederName: 'Kimberly B.',
        preferredUnit: 'kg',
        defaultGenerations: 4,
      }),
      speciesProfiles: [rabbitProfile],
      animals: [makeAnimal('r1', { name: 'Maple Star', species: 'Rabbit', weightGrams: 4500 })],
    });

    const defaults = buildDefaultBarnBinderOptions(snap.settings);
    expect(defaults.generations).toBe(4);
    expect(defaults.includeArchived).toBe(false);

    const html = generateSpeciesBarnBinderHtml(snap, 'Rabbit', defaults);
    expect(html).toContain('Cedar Ridge Barn');
    expect(html).toContain('Kimberly B.');
    expect(html).toContain('Kilograms (kg)');
    expect(html).toContain('inherited from Barn Settings');
    expect(html).toContain('4.50 kg');
    expect(html).toContain('4 Generations (inherited default)');
    expect(html).toContain('Breeder Truthfulness Acknowledgment &amp; Herd Transfer Certification');

    expect(buildBarnBinderFileName('Cedar Ridge Barn', 'Rabbit', '2026-11-16')).toBe(
      'cedar-ridge-barn-rabbit-binder-2026-11-16.htm'
    );
  });

  it('renders active-only by default while preserving full lineage, noteworthy archived/deceased relatives, medical logs, litters, shows, reg #, photos & remaining notes', () => {
    const gcGrandsire = makeAnimal('gs1', {
      name: 'Grand Legend',
      tattoo: 'GL-1',
      species: 'Rabbit',
      sex: 'Male',
      status: 'Deceased',
      archived: true,
      grandChampionNumber: 'GC-9942',
      legsCount: 5,
    });
    const sire = makeAnimal('s1', {
      name: 'Red Baron',
      tattoo: 'RB-10',
      species: 'Rabbit',
      sex: 'Male',
      status: 'Sold',
      archived: true,
      sireId: 'gs1',
      legsCount: 3,
      registrationNumber: 'REG-S100',
    });
    const dam = makeAnimal('d1', {
      name: 'Autumn Blossom',
      tattoo: 'AB-22',
      species: 'Rabbit',
      sex: 'Female',
      status: 'Active',
    });
    const subject = makeAnimal('sub1', {
      name: 'Ruby Horizon',
      tattoo: 'RH-301',
      species: 'Rabbit',
      sex: 'Female',
      status: 'Active',
      sireId: 's1',
      damId: 'd1',
      registrationNumber: 'REG-RH-8899',
      grandChampionNumber: 'GC-2026',
      legsCount: 4,
      genotype: [
        { locus: 'A', allele1: 'A', allele2: 'a' },
        { locus: 'E', allele1: 'e', allele2: 'e' },
      ],
      genotypeRaw: 'Aa B_ C_ D_ ee',
      notes: 'Calm mother, broad hindquarters, sensitive to sudden feed switch.',
    });
    const activeKit = makeAnimal('k1', {
      name: 'Copper Pebble',
      tattoo: 'CP-401',
      species: 'Rabbit',
      sex: 'Male',
      status: 'Junior',
      sireId: 'gs1',
      damId: 'sub1',
      legsCount: 1,
    });
    const soldKit = makeAnimal('k2', {
      name: 'Crimson Flash',
      tattoo: 'CF-402',
      species: 'Rabbit',
      sex: 'Female',
      status: 'Sold',
      archived: true,
      sireId: 'gs1',
      damId: 'sub1',
      grandChampionNumber: 'GC-7711',
      legsCount: 4,
    });
    const halfSib = makeAnimal('hs1', {
      name: 'Amber Sun',
      tattoo: 'AS-205',
      species: 'Rabbit',
      sex: 'Female',
      status: 'Active',
      sireId: 's1',
    });

    const rabbitSp = makeSpeciesProfile('Rabbit');
    rabbitSp.memoText = 'Watch ventilation fan switch in North aisle.';

    const snap = makeEmptySnapshot({
      speciesProfiles: [rabbitSp],
      animals: [gcGrandsire, sire, dam, subject, activeKit, soldKit, halfSib],
      careLogs: [
        {
          id: 'cl1',
          species: 'Rabbit',
          animalId: 'sub1',
          dateIso: '2026-08-12',
          type: 'Health / Vet',
          title: 'Ear Mite Preventative',
          weightGrams: 4620,
          showLegEarned: false,
          notes: 'Clean ears, healthy coat.',
          createdAt: '2026-08-12T10:00:00Z',
          updatedAt: '2026-08-12T10:00:00Z',
        },
        {
          id: 'cl2',
          species: 'Rabbit',
          animalId: 'sub1',
          dateIso: '2026-09-20',
          type: 'Show / Leg',
          title: 'Best of Breed — State Fair',
          weightGrams: 0,
          showLegEarned: true,
          notes: 'Class of 18 senior does.',
          createdAt: '2026-09-20T10:00:00Z',
          updatedAt: '2026-09-20T10:00:00Z',
        },
      ],
      breedings: [
        {
          id: 'br1',
          species: 'Rabbit',
          sireId: 'gs1',
          damId: 'sub1',
          sireName: 'Grand Legend',
          damName: 'Ruby Horizon',
          bredDateIso: '2026-03-01',
          expectedDueDateIso: '2026-04-01',
          actualBirthDateIso: '2026-04-02',
          projectedCoiPercent: 12.5,
          liveCount: 7,
          stillbornCount: 1,
          fosteredCount: 0,
          weanedCount: 7,
          offspringCreated: true,
          status: 'Weaned',
          notes: 'Pulled generous fur nest overnight.',
          createdAt: '2026-03-01T10:00:00Z',
          updatedAt: '2026-05-15T10:00:00Z',
        },
      ],
      shows: [
        {
          id: 'sh1',
          species: 'Rabbit',
          name: 'Midwest Specialty Show',
          location: 'Madison, WI',
          sanctioningBody: 'ARBA',
          eventDateIso: '2026-10-10',
          entryDeadlineIso: '2026-10-01',
          enteredAnimalIds: ['sub1'],
          notes: 'Open Youth & Senior Doe division.',
          createdAt: '2026-09-01T10:00:00Z',
          updatedAt: '2026-09-01T10:00:00Z',
        },
      ],
      cages: [
        {
          id: 'cg1',
          species: 'Rabbit',
          label: 'R-1',
          section: 'Does Row',
          capacity: 1,
          notes: 'All-wire 30x36 cage',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
      animalPhotos: [
        {
          id: 'ph1',
          species: 'Rabbit',
          animalId: 'sub1',
          isPrimary: true,
          sortOrder: 0,
          caption: 'Side profile showing smooth hindquarters at State Fair',
          originalFileName: 'ruby-profile.webp',
          mimeType: 'image/webp',
          width: 800,
          height: 600,
          originalBytes: 12000,
          storedBytes: 12000,
          thumbnailDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
          createdAt: '2026-09-21T10:00:00Z',
          updatedAt: '2026-09-21T10:00:00Z',
        },
      ],
    });

    const kinship = computeAnimalKinshipSummary(subject, snap.animals, snap.careLogs, rabbitSp);
    expect(kinship.directOffspring.map((o) => o.animal.id).sort()).toEqual(['k1', 'k2']);
    expect(kinship.inHerdRelatives.some((r) => r.animal.id === 'hs1')).toBe(true);
    expect(kinship.inHerdRelatives.some((r) => r.animal.id === 'd1')).toBe(true);
    // Noteworthy includes deceased Grand Legend & sold Crimson Flash
    expect(kinship.noteworthyRelatives.some((n) => n.animal.id === 'gs1')).toBe(true);
    expect(kinship.noteworthyRelatives.some((n) => n.animal.id === 'k2')).toBe(true);

    // Active-only default omits archived animals as top-level dossiers while keeping kinship references
    const activeOnlyHtml = generateSpeciesBarnBinderHtml(snap, 'Rabbit', {
      includeArchived: false,
    });
    expect(activeOnlyHtml).toContain('Active &amp; Current Breeding Stock Only');
    expect(activeOnlyHtml).toContain('Ruby Horizon');
    expect(activeOnlyHtml).toContain('REG-RH-8899');
    expect(activeOnlyHtml).toContain('Aa B_ C_ D_ ee');
    expect(activeOnlyHtml).toContain('Ear Mite Preventative');
    expect(activeOnlyHtml).toContain('Pulled generous fur nest overnight.');
    expect(activeOnlyHtml).toContain('Midwest Specialty Show');
    expect(activeOnlyHtml).toContain('Side profile showing smooth hindquarters at State Fair');
    expect(activeOnlyHtml).toContain('Calm mother, broad hindquarters, sensitive to sudden feed switch.');
    expect(activeOnlyHtml).toContain('Watch ventilation fan switch in North aisle.');
    // Archived animals are referenced in kinship/noteworthy tables, NOT as standalone dossiers
    expect(activeOnlyHtml).not.toContain('>Grand Legend<span');
    expect(activeOnlyHtml).toContain('GC-9942');
    expect(activeOnlyHtml).toContain('GC-7711');

    // Full archive toggle promotes deceased/sold animals to full standalone dossiers
    const fullArchiveHtml = generateSpeciesBarnBinderHtml(snap, 'Rabbit', {
      includeArchived: true,
    });
    expect(fullArchiveHtml).toContain('Complete Species Archive (Active + Archived / Sold / Deceased)');
    expect(fullArchiveHtml).toContain('Grand Legend');
    expect(fullArchiveHtml).toContain('Red Baron');
    expect(fullArchiveHtml).toContain('Crimson Flash');
  });

  it('automatically embeds complete Barn Binder .HTM files inside both Mass and Species .ZIP backups with zero breaking effect on restore', () => {
    const snap = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Rabbit'), makeSpeciesProfile('Sheep')],
      animals: [
        makeAnimal('r-active', { name: 'Clover', species: 'Rabbit', status: 'Active' }),
        makeAnimal('r-arch', {
          name: 'Old Timer',
          species: 'Rabbit',
          status: 'Deceased',
          archived: true,
        }),
        makeAnimal('s-active', { name: 'Woolly', species: 'Sheep', status: 'Active' }),
      ],
    });

    // Mass Backup .ZIP includes binders for ALL species and ALL animals (including Archived/Deceased)
    const massZip = buildCompleteBackupZipArchive(snap);
    expect(massZip.binderCount).toBe(2);
    const massEntries = unzipSync(massZip.bytes);
    expect(massEntries['binder/rabbit-binder.htm']).toBeTruthy();
    expect(massEntries['binder/sheep-binder.htm']).toBeTruthy();
    const massRabbitBinder = strFromU8(massEntries['binder/rabbit-binder.htm']);
    expect(massRabbitBinder).toContain('Clover');
    expect(massRabbitBinder).toContain('Old Timer');
    expect(massRabbitBinder).toContain('Complete Species Archive');

    // Mass ZIP restores cleanly without binder HTML causing issues
    const restoredMass = parseBackupArchiveInput(
      massZip.bytes,
      'community-pedigree-archive.zip',
      snap.settings
    );
    expect(restoredMass.kind).toBe('full_snapshot');
    if (restoredMass.kind === 'full_snapshot') {
      expect(restoredMass.snapshot.animals).toHaveLength(3);
    }

    // Species Backup .ZIP automatically embeds ONLY that species binder (still with ALL animals of that species)
    const speciesZip = buildCompleteBackupZipArchive(snap, 'Rabbit', {
      backupScope: 'species',
      backupReason: 'manual',
      targetSpecies: 'Rabbit',
    });
    expect(speciesZip.binderCount).toBe(1);
    const spEntries = unzipSync(speciesZip.bytes);
    expect(spEntries['binder/rabbit-binder.htm']).toBeTruthy();
    expect(spEntries['binder/sheep-binder.htm']).toBeUndefined();
    const spBinder = strFromU8(spEntries['binder/rabbit-binder.htm']);
    expect(spBinder).toContain('Old Timer');

    const restoredSpecies = parseBackupArchiveInput(
      speciesZip.bytes,
      'meadowbrook-rabbit-backup.zip',
      snap.settings
    );
    expect(restoredSpecies.kind).toBe('full_snapshot');
    if (restoredSpecies.kind === 'full_snapshot') {
      expect(restoredSpecies.snapshot.animals.map((a) => a.id).sort()).toEqual([
        'r-active',
        'r-arch',
      ]);
    }
  });
});
