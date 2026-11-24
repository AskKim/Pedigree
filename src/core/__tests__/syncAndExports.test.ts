import { describe, expect, it } from 'vitest';
import {
  applyAnimalNamePrefix,
  BarnJournalEntry,
  formatWeight,
  getSpeciesIdentifierLabels,
  MileageLog,
  parseWeightInputToGrams,
  resolveSpeciesWeightUnit,
} from '../models';
import {
  countSpeciesNonTestingRecords,
  countSpeciesTestingRecords,
  purgeSpeciesNonTestingDataPure,
} from '../sampleData';
import {
  buildCleanBackupFileName,
  buildSpeciesSafetyBackupFileName,
  exportAnimalsCsv,
  exportBarnBackupJson,
  exportSpeciesBackupJson,
  generateBarnBackupJsonChunks,
  generateEvansHtmPedigree,
  generateThermalCageCardHtml,
  mergeBarnSnapshots,
  parseBarnBackupJson,
} from '../syncAndExports';
import { resolvePedigreePrintTheme } from '../pedigreePrintStyles';
import {
  buildShareablePedigreeCardFileName,
  generateShareablePedigreeCardHtml,
} from '../shareablePedigreeCard';
import { diffSnapshotsToSyncOperations, mergeDeltaOperations } from '../syncOutbox';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('syncAndExports — multi-device snapshot merge, JSON backup & 5/6-gen HTM exports', () => {
  it('merges snapshots deterministically by UUID and ISO updatedAt timestamp', () => {
    const sharedOld = makeAnimal('a1', {
      name: 'Old Name',
      updatedAt: '2026-01-01T10:00:00.000Z',
    });
    const localNewer = makeAnimal('a2', {
      name: 'Local Winner',
      updatedAt: '2026-02-10T10:00:00.000Z',
    });

    const local = makeEmptySnapshot({
      settings: makeSettings({ updatedAt: '2026-01-01T10:00:00.000Z', barnName: 'Old Barn' }),
      animals: [sharedOld, localNewer],
    });

    const incoming = makeEmptySnapshot({
      settings: makeSettings({
        updatedAt: '2026-03-01T10:00:00.000Z',
        barnName: 'Updated Barn',
        defaultGenerations: 5,
      }),
      animals: [
        makeAnimal('a1', { name: 'Remote Winner', updatedAt: '2026-02-15T10:00:00.000Z' }),
        makeAnimal('a2', { name: 'Stale Remote', updatedAt: '2026-01-05T10:00:00.000Z' }),
        makeAnimal('a3', { name: 'Brand New', updatedAt: '2026-02-20T10:00:00.000Z' }),
      ],
    });

    const report = mergeBarnSnapshots(local, incoming);
    const mergedById = new Map(report.snapshot.animals.map((a) => [a.id, a]));

    expect(report.animalsAdded).toBe(1);
    expect(report.animalsUpdated).toBe(1);
    expect(report.snapshot.animals).toHaveLength(3);
    expect(mergedById.get('a1')?.name).toBe('Remote Winner');
    expect(mergedById.get('a2')?.name).toBe('Local Winner');
    expect(mergedById.get('a3')?.name).toBe('Brand New');
    expect(report.snapshot.settings.barnName).toBe('Updated Barn');
    expect(report.snapshot.settings.defaultGenerations).toBe(5);
  });

  it('builds clean, descriptive filenames for JSON and SQLite backups', () => {
    expect(buildCleanBackupFileName('Meadowbrook Rabbitry', 'json', '2026-11-14')).toBe(
      'meadowbrook-rabbitry-backup-2026-11-14.json'
    );
    expect(buildCleanBackupFileName('Meadowbrook Rabbitry', 'sqlite', '2026-11-14')).toBe(
      'meadowbrook-rabbitry-2026-11-14.sqlite'
    );
    expect(buildCleanBackupFileName('My Barn', 'json', '2026-11-14')).toBe(
      'pedigree-backup-2026-11-14.json'
    );
  });

  it('exports clean human-readable JSON v5 backups with barnSummary and deterministic sorting, and round-trips cleanly', () => {
    const snap = makeEmptySnapshot({
      settings: makeSettings({
        barnName: 'Sunny Slope Barn',
        breederName: 'Breeder',
        defaultGenerations: 6,
        pinnedLandingSpecies: 'Rabbit',
      }),
      animals: [
        makeAnimal('b2', {
          name: 'Retired Lady',
          status: 'Archived',
          sex: 'Female',
          species: 'Rabbit',
        }),
        makeAnimal('b1', {
          name: 'Red Baron',
          status: 'Active',
          sex: 'Male',
          species: 'Rabbit',
          needsAttention: true,
        }),
        makeAnimal('s1', { name: 'Ewe One', status: 'Active', sex: 'Female', species: 'Sheep' }),
      ],
    });

    const json = exportBarnBackupJson(snap);
    const parsedRaw = JSON.parse(json);

    expect(parsedRaw.exportedAtLocal).toBeTruthy();
    expect(parsedRaw.barnSummary.barnName).toBe('Sunny Slope Barn');
    expect(parsedRaw.barnSummary.breederName).toBe('Breeder');
    expect(parsedRaw.barnSummary.counts.animals).toBe(3);
    expect(parsedRaw.barnSummary.counts.activeAnimals).toBe(2);
    expect(parsedRaw.barnSummary.counts.archivedAnimals).toBe(1);
    expect(parsedRaw.barnSummary.bySpecies.find((s: { species: string }) => s.species === 'Rabbit')?.totalAnimals).toBe(2);
    // Active Rabbit appears before Archived Rabbit; Rabbit precedes Sheep alphabetically
    expect(parsedRaw.animals.map((a: { id: string }) => a.id)).toEqual(['b1', 'b2', 's1']);

    const restored = parseBarnBackupJson(json, makeSettings());
    expect(restored.settings.defaultGenerations).toBe(6);
    expect(restored.settings.pinnedLandingSpecies).toBe('Rabbit');
    expect(restored.animals).toHaveLength(3);
    expect(restored.animals.find((a) => a.id === 'b2')?.status).toBe('Archived');
    expect(restored.animals.find((a) => a.id === 'b1')?.needsAttention).toBe(true);
    expect(restored.animals.find((a) => a.id === 'b2')?.needsAttention).toBe(false);
  });

  it('generates valid Evans .HTM pedigrees for 5-gen (32 rows) and 6-gen (64 rows)', () => {
    const sire = makeAnimal('s1', { name: 'Sire Alpha', sex: 'Male', tattoo: 'S1' });
    const dam = makeAnimal('d1', { name: 'Dam Beta', sex: 'Female', tattoo: 'D1' });
    const subj = makeAnimal('sub', {
      name: 'Champion <Red>',
      sex: 'Male',
      sireId: 's1',
      damId: 'd1',
    });
    const snap = makeEmptySnapshot({ animals: [sire, dam, subj] });

    const html5 = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      snap.settings,
      5
    );
    expect(html5).toContain('Official 5-Generation Rabbit Pedigree Certificate');
    expect(html5).toContain('5th Generation (Gen 5)');
    expect(html5).not.toContain('6th Generation (Gen 6)');
    expect(html5).toContain('Champion &lt;Red&gt;');
    expect(html5).toContain('rowspan="16"');

    const html6 = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      snap.settings,
      6
    );
    expect(html6).toContain('Official 6-Generation Rabbit Pedigree Certificate');
    expect(html6).toContain('6th Generation (Gen 6)');
    expect(html6).toContain('rowspan="32"');
  });

  it('escapes commas and quotes properly when exporting RFC-4180 CSV', () => {
    const snap = makeEmptySnapshot({
      animals: [
        makeAnimal('c1', {
          name: 'Lady "Duchess", Jr.',
          species: 'Rabbit',
          sex: 'Female',
          needsAttention: true,
          notes: 'Line 1\nLine 2',
        }),
        makeAnimal('c2', {
          name: 'Ewe One',
          species: 'Sheep',
          sex: 'Female',
        }),
      ],
    });

    const rabbitCsv = exportAnimalsCsv(snap.animals, snap.speciesProfiles, snap.settings, 'Rabbit');
    expect(rabbitCsv).toContain('"Lady ""Duchess"", Jr."');
    expect(rabbitCsv).toContain('"Line 1\nLine 2"');
    expect(rabbitCsv).toContain('Needs_Attention');
    expect(rabbitCsv).toContain('Yes');
    expect(rabbitCsv).not.toContain('Ewe One');
  });

  it('builds collision-free timestamped species safety backup filenames & isolated species JSON backups', () => {
    const dailyFile = buildCleanBackupFileName('Sunny Slope', 'json', '2026-11-15');
    const safetyFile = buildSpeciesSafetyBackupFileName(
      'Sunny Slope',
      'Rabbit',
      'pre-remove-non-testing',
      '2026-11-15_06-05-19'
    );
    expect(safetyFile).toBe('sunny-slope-rabbit-pre-clear-non-testing-2026-11-15_06-05-19.json');
    expect(safetyFile).not.toBe(dailyFile);

    const snap = makeEmptySnapshot({
      animals: [
        makeAnimal('r1', { name: 'Rabbit One', species: 'Rabbit' }),
        makeAnimal('s1', { name: 'Sheep One', species: 'Sheep' }),
      ],
    });

    const speciesJson = exportSpeciesBackupJson(snap, 'Rabbit', {
      reason: 'pre-remove-species',
    });
    const parsedRaw = JSON.parse(speciesJson);
    expect(parsedRaw.backupScope).toBe('species');
    expect(parsedRaw.backupReason).toBe('pre-remove-species');
    expect(parsedRaw.targetSpecies).toBe('Rabbit');
    expect(parsedRaw.animals.map((a: { id: string }) => a.id)).toEqual(['r1']);

    // Restoring or merging a species-only backup leaves other species untouched
    const emptyRabbitSnapshot = makeEmptySnapshot({
      speciesProfiles: [makeSpeciesProfile('Sheep')],
      animals: [makeAnimal('s1', { name: 'Sheep One', species: 'Sheep' })],
    });
    const parsedSpecies = parseBarnBackupJson(speciesJson, emptyRabbitSnapshot.settings);
    const merged = mergeBarnSnapshots(emptyRabbitSnapshot, parsedSpecies);
    expect(merged.snapshot.animals.map((a) => a.id).sort()).toEqual(['r1', 's1']);
  });

  it('purges non-testing species records while keeping sample testing records and other species intact', () => {
    const snap = makeEmptySnapshot({
      animals: [
        makeAnimal('seed-rabbit-sire', { name: 'Sample Buck', species: 'Rabbit' }),
        makeAnimal('real-rabbit-1', {
          name: 'Real Kit',
          species: 'Rabbit',
          sireId: 'seed-rabbit-sire',
        }),
        makeAnimal('real-sheep-1', { name: 'Real Ewe', species: 'Sheep' }),
      ],
    });

    expect(countSpeciesTestingRecords(snap, 'Rabbit')).toBe(1);
    expect(countSpeciesNonTestingRecords(snap, 'Rabbit')).toBe(1);

    const purged = purgeSpeciesNonTestingDataPure(snap, 'Rabbit');
    expect(purged.removedAnimals).toBe(1);
    expect(purged.nextSnapshot.animals.map((a) => a.id)).toEqual([
      'seed-rabbit-sire',
      'real-sheep-1',
    ]);
  });

  it('applies optional default species naming prefix only when animal name does not already have it', () => {
    expect(applyAnimalNamePrefix('Ruby Rose', 'Oak Ridge')).toBe('Oak Ridge Ruby Rose');
    expect(applyAnimalNamePrefix('Oak Ridge Ruby Rose', 'Oak Ridge')).toBe('Oak Ridge Ruby Rose');
    expect(applyAnimalNamePrefix('oak ridge Ruby Rose', 'Oak Ridge')).toBe('oak ridge Ruby Rose');
    expect(applyAnimalNamePrefix('Ruby', 'OR-')).toBe('OR-Ruby');
    expect(applyAnimalNamePrefix('Ruby', '')).toBe('Ruby');
  });

  it('supports kg units, per-species weight overrides across backups/CSV, and species-aware identifier labels', () => {
    expect(formatWeight(18500, 'kg')).toBe('18.50 kg');
    expect(parseWeightInputToGrams('18.5', 'kg')).toBe(18500);

    const dogProfile = { ...makeSpeciesProfile('Dog'), preferredUnit: 'kg' as const };
    const rabbitProfile = makeSpeciesProfile('Rabbit');
    const settings = makeSettings({ preferredUnit: 'lbs_oz' });

    expect(resolveSpeciesWeightUnit(dogProfile, settings)).toBe('kg');
    expect(resolveSpeciesWeightUnit(rabbitProfile, settings)).toBe('lbs_oz');

    const snap = makeEmptySnapshot({
      settings,
      speciesProfiles: [dogProfile, rabbitProfile],
      animals: [
        makeAnimal('d1', { species: 'Dog', name: 'Scout', weightGrams: 22500 }),
        makeAnimal('r1', { species: 'Rabbit', name: 'Ruby', weightGrams: 4536 }),
      ],
    });

    const csv = exportAnimalsCsv(snap.animals, snap.speciesProfiles, settings);
    expect(csv).toContain('22.50 kg');
    expect(csv).toContain('10 lb 0 oz');

    const restored = parseBarnBackupJson(exportBarnBackupJson(snap), makeSettings());
    expect(restored.speciesProfiles.find((s) => s.name === 'Dog')?.preferredUnit).toBe('kg');
    expect(restored.speciesProfiles.find((s) => s.name === 'Rabbit')?.preferredUnit).toBeUndefined();

    expect(getSpeciesIdentifierLabels('Dog').fieldLabel).toContain('Microchip');
    expect(getSpeciesIdentifierLabels('Cattle').fieldLabel).toContain('Ear Tag');
    expect(getSpeciesIdentifierLabels('Rabbit').fieldLabel).toContain('Ear Tattoo');
  });

  it('respects PedigreePrintOptions for hiding weights, hiding genotypes, and printing breeder contact footer', () => {
    const subj = makeAnimal('p1', {
      name: 'Customer Doe',
      species: 'Rabbit',
      sex: 'Female',
      weightGrams: 4082,
      genotypeRaw: 'A_ B_ C_ D_ E_',
    });
    const snap = makeEmptySnapshot({ animals: [subj] });

    const customerHtml = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      snap.settings,
      3,
      undefined,
      {
        showWeights: false,
        showGenotypes: false,
        showBreederFooter: true,
        breederContactLine: 'https://oakridge-example.test · (555) 010-2000',
      }
    );

    expect(customerHtml).not.toContain('<strong>Weight:</strong>');
    expect(customerHtml).not.toContain('<strong>Genotype:</strong>');
    expect(customerHtml).toContain('https://oakridge-example.test · (555) 010-2000');
    expect(customerHtml).toContain('Breeder Signature:');

    const noFooterHtml = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      snap.settings,
      3,
      undefined,
      {
        showWeights: true,
        showGenotypes: true,
        showBreederFooter: false,
      }
    );
    expect(noFooterHtml).toContain('<strong>Weight:</strong>');
    expect(noFooterHtml).toContain('<strong>Genotype:</strong>');
    expect(noFooterHtml).not.toContain('Breeder Signature:');
  });

  it('forces light-only color-scheme and white #ffffff print backgrounds with zero dark background fills in .HTM exports', () => {
    const subj = makeAnimal('p-ink', {
      name: 'Ink Saver',
      tattoo: 'INK-1',
      species: 'Rabbit',
    });
    const darkThemeSettings = makeSettings({ themeMode: 'dark' });
    const snap = makeEmptySnapshot({ settings: darkThemeSettings, animals: [subj] });

    const pedigreeHtml = generateEvansHtmPedigree(
      subj,
      snap.animals,
      snap.speciesProfiles,
      darkThemeSettings,
      3
    );
    expect(pedigreeHtml).toContain('<meta name="color-scheme" content="light only" />');
    expect(pedigreeHtml).toContain('@media print');
    expect(pedigreeHtml).toContain('background: #ffffff !important;');
    expect(pedigreeHtml).not.toContain('background: #2d5a3d');
    expect(pedigreeHtml).not.toContain('#0f1611');

    const cardHtml = generateThermalCageCardHtml(
      subj,
      snap.animals,
      snap.speciesProfiles,
      darkThemeSettings
    );
    expect(cardHtml).toContain('<meta name="color-scheme" content="light only" />');
    expect(cardHtml).toContain('@media print');
    expect(cardHtml).toContain('#ffffff !important;');
    expect(cardHtml).not.toContain('#0f1611');
  });

  it('includes confirmed, cleared, and ancestral carrier disclosures in buildPdfReadyBarnSnapshot', async () => {
    const { buildPdfReadyBarnSnapshot } = await import('../syncAndExports');
    const sire = makeAnimal('sire-car', {
      name: 'Carrier Buck',
      species: 'Rabbit',
      sex: 'Male',
      confirmedCarrierOf: ['Vienna (Blue-Eyed White)'],
    });
    const kit = makeAnimal('kit-car', {
      name: 'Kit Prospect',
      species: 'Rabbit',
      sex: 'Female',
      sireId: 'sire-car',
      clearedCarrierOf: [{ trait: 'Rex Fur', proofType: 'dna_tested' }],
    });
    const snap = makeEmptySnapshot({ animals: [sire, kit] });
    const dto = buildPdfReadyBarnSnapshot(snap, 'Rabbit');
    const kitDto = dto.animals.find((a) => a.id === 'kit-car');

    expect(kitDto).toBeTruthy();
    expect(kitDto?.carrierDisclosures).toContain('Lineage Potential: Vienna (Blue-Eyed White) (Sire)');
    expect(kitDto?.carrierDisclosures).toContain('Cleared: Rex Fur (DNA Clear)');
  });

  it('streams backup JSON chunks via generateBarnBackupJsonChunks with exact parity to exportBarnBackupJson', () => {
    const animals = Array.from({ length: 10 }, (_, idx) =>
      makeAnimal(`a-${idx + 1}`, {
        name: `Animal ${idx + 1}`,
        species: 'Rabbit',
        sex: idx % 2 === 0 ? 'Male' : 'Female',
        notes: `Detailed breeding & show record #${idx + 1}: ` + 'pedigree-note-'.repeat(40),
      })
    );
    const snap = makeEmptySnapshot({
      settings: makeSettings({ barnName: 'Chunked Barn', breederName: 'Alex' }),
      animals,
      animalPhotos: [
        {
          id: 'p1',
          species: 'Rabbit',
          animalId: 'a-1',
          isPrimary: true,
          sortOrder: 0,
          caption: 'Cover',
          originalFileName: 'a1.png',
          mimeType: 'image/png',
          width: 1,
          height: 1,
          originalBytes: 120,
          storedBytes: 68,
          thumbnailDataUrl: 'data:image/png;base64,AAAA',
          dataUrl: 'data:image/png;base64,BBBB',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const chunks = Array.from(
      generateBarnBackupJsonChunks(snap, { backupScope: 'species', targetSpecies: 'Rabbit' }, 4096)
    );
    expect(chunks.length).toBeGreaterThan(2);

    const streamedJoined = chunks.join('');
    const monolithic = exportBarnBackupJson(snap, {
      backupScope: 'species',
      targetSpecies: 'Rabbit',
    });

    const streamedParsed = JSON.parse(streamedJoined);
    const monolithicParsed = JSON.parse(monolithic);
    // Normalize millisecond timestamps in case clock ticked between calls
    streamedParsed.exportedAtIsoUtc = monolithicParsed.exportedAtIsoUtc;
    streamedParsed.exportedAtLocal = monolithicParsed.exportedAtLocal;
    expect(streamedParsed).toEqual(monolithicParsed);

    const restored = parseBarnBackupJson(streamedJoined, makeSettings());
    expect(restored.animals).toHaveLength(10);
    expect(restored.animalPhotos).toHaveLength(1);
  });

  it('renders 7-gen and 8-gen Evans .HTM pedigrees with custom print presets locked to #FFFFFF paper', () => {
    const gen8Sire = makeAnimal('g8-root', {
      sex: 'Male',
      name: 'Foundation Eighth',
      tattoo: 'G8-1',
    });
    const gen7Sire = makeAnimal('g7-root', {
      sex: 'Male',
      name: 'Seventh Sire',
      sireId: 'g8-root',
    });
    const gen6Sire = makeAnimal('g6-root', { sex: 'Male', name: 'Sixth Sire', sireId: 'g7-root' });
    const gen5Sire = makeAnimal('g5-root', { sex: 'Male', name: 'Fifth Sire', sireId: 'g6-root' });
    const gen4Sire = makeAnimal('g4-root', { sex: 'Male', name: 'Fourth Sire', sireId: 'g5-root' });
    const gen3Sire = makeAnimal('g3-root', { sex: 'Male', name: 'Third Sire', sireId: 'g4-root' });
    const gen2Sire = makeAnimal('g2-root', { sex: 'Male', name: 'Second Sire', sireId: 'g3-root' });
    const gen1Sire = makeAnimal('g1-root', { sex: 'Male', name: 'First Sire', sireId: 'g2-root' });
    const subject = makeAnimal('subj-ev8', {
      sex: 'Female',
      name: 'Eighth Gen Prospect',
      tattoo: 'EGP8',
      sireId: 'g1-root',
    });
    const animals = [
      gen8Sire,
      gen7Sire,
      gen6Sire,
      gen5Sire,
      gen4Sire,
      gen3Sire,
      gen2Sire,
      gen1Sire,
      subject,
    ];
    const profiles = [makeSpeciesProfile('Rabbit')];
    const settings = makeSettings({ barnName: 'Heritage Hutch' });

    const html8 = generateEvansHtmPedigree(subject, animals, profiles, settings, 8, undefined, {
      colorPreset: 'royal_navy',
      borderStyle: 'double_frame',
      layoutPreset: 'show_certificate',
    });

    expect(html8).toContain('Official 8-Generation Rabbit Pedigree Certificate');
    expect(html8).toContain('Gen 7');
    expect(html8).toContain('Gen 8');
    expect(html8).toContain('Foundation Eighth');
    expect(html8).toContain('class="cell leaf sire"');
    expect(html8).toContain('border: 4px double #1B365D');
    expect(html8).toContain('flex-direction: column; align-items: center; text-align: center;');
    expect(html8).toContain('<meta name="barn-preserve-accent-ink" content="true" />');
    expect(html8).toContain('#1B365D'); // Royal Navy primary ink
    expect(html8).toContain('background: #ffffff !important;');

    const barnTheme = resolvePedigreePrintTheme(
      { colorPreset: 'barn_palette', borderStyle: 'modern_rounded', layoutPreset: 'compact_ledger' },
      {
        lightPrimary: '#E5E7EB', // very bright color should darken automatically for white-paper contrast
        lightAccent: '#7C2D12',
        lightMale: '#1D4ED8',
        darkPrimary: '#22C55E',
        darkAccent: '#F97316',
        darkMale: '#60A5FA',
      }
    );
    expect(barnTheme.paperBg).toBe('#FFFFFF');
    expect(barnTheme.primaryHex).not.toBe('#E5E7EB');
  });

  it('builds lightweight standalone shareable pedigree cards with QR link, XSS escaping & collapsible Gen 4-8 details', () => {
    const g5 = makeAnimal('g5-c', { sex: 'Male', name: 'Anchor G5', tattoo: 'A5', variety: 'Black' });
    const g4 = makeAnimal('g4-c', { sex: 'Male', name: 'Anchor G4', sireId: 'g5-c' });
    const g3 = makeAnimal('g3-c', { sex: 'Male', name: 'Anchor G3', sireId: 'g4-c' });
    const g2 = makeAnimal('g2-c', { sex: 'Male', name: 'Anchor G2', sireId: 'g3-c' });
    const g1 = makeAnimal('g1-c', { sex: 'Male', name: 'Anchor G1', sireId: 'g2-c' });
    const subject = makeAnimal('subj-card', {
      sex: 'Female',
      name: 'Daisy <script>alert(1)</script>',
      tattoo: 'DZY-42',
      breed: 'Holland Lop',
      variety: 'Broken Tort',
      weightGrams: Math.round(62 * 28.349523125),
      registrationNumber: 'R-9910',
      legsCount: 3,
      sireId: 'g1-c',
    });

    expect(buildShareablePedigreeCardFileName(subject)).toBe('pedigree-card-dzy-42.html');

    const cardHtml = generateShareablePedigreeCardHtml(
      subject,
      [g5, g4, g3, g2, g1, subject],
      [makeSpeciesProfile('Rabbit')],
      makeSettings({ barnName: 'Meadowbrook Rabbitry' }),
      6,
      undefined,
      {
        colorPreset: 'heritage_burgundy',
        borderStyle: 'modern_rounded',
        arbaLbsOzDotNotation: true,
        includeQrCode: true,
        appBaseUrl: 'https://pedigree.example.org/',
      }
    );

    expect(cardHtml).toContain('<!DOCTYPE html>');
    expect(cardHtml).toContain('3-Generation Lineage Summary');
    expect(cardHtml).toContain('Extended Ancestry (Gen 4&ndash;6: 2 recorded ancestors)');
    expect(cardHtml).toContain('Anchor G5');
    expect(cardHtml).toContain('3.14'); // 62 oz = 3 lb 14 oz
    expect(cardHtml).toContain('Reg: R-9910');
    expect(cardHtml).toContain('3 Legs');
    expect(cardHtml).toContain('class="qr-svg"');
    expect(cardHtml).not.toContain('<script>alert(1)</script>');
    expect(cardHtml).toContain('Daisy &lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('preserves SpeciesProfile.targetWeightCurve and BreedingRecord.litterWeightMilestones across JSON backup & merge', () => {
    const profileWithCurve = {
      ...makeSpeciesProfile('Rabbit'),
      targetWeightCurve: [
        { ageDays: 21, weightGrams: 540, label: '3w Goal' },
        { ageDays: 56, weightGrams: 2041, label: '8w Wean Goal' },
      ],
      updatedAt: '2026-06-15T12:00:00.000Z',
    };
    const snap = makeEmptySnapshot({
      speciesProfiles: [profileWithCurve, makeSpeciesProfile('Sheep')],
      breedings: [
        {
          id: 'b-curve-1',
          species: 'Rabbit',
          sireId: 's1',
          damId: 'd1',
          sireName: 'Buck A',
          damName: 'Doe B',
          bredDateIso: '2026-05-01',
          expectedDueDateIso: '2026-06-01',
          actualBirthDateIso: '2026-06-01',
          projectedCoiPercent: 0,
          liveCount: 6,
          stillbornCount: 0,
          fosteredCount: 0,
          weanedCount: 6,
          offspringCreated: false,
          status: 'Weaned',
          litterWeightMilestones: [
            {
              id: 'lwm-21',
              ageDays: 21,
              label: '3-Week Check',
              liveCount: 6,
              totalWeightGrams: 3180,
              avgWeightGrams: 530,
            },
          ],
          notes: '',
          createdAt: '2026-06-01T12:00:00.000Z',
          updatedAt: '2026-06-22T12:00:00.000Z',
        },
      ],
    });

    const parsed = parseBarnBackupJson(exportBarnBackupJson(snap), makeSettings());
    const parsedRabbit = parsed.speciesProfiles.find((s) => s.name === 'Rabbit');
    expect(parsedRabbit?.targetWeightCurve).toEqual([
      { ageDays: 21, weightGrams: 540, label: '3w Goal' },
      { ageDays: 56, weightGrams: 2041, label: '8w Wean Goal' },
    ]);
    expect(parsed.breedings[0].litterWeightMilestones).toHaveLength(1);
    expect(parsed.breedings[0].litterWeightMilestones?.[0].avgWeightGrams).toBe(530);

    const localOld = makeEmptySnapshot();
    const merged = mergeBarnSnapshots(localOld, parsed);
    const mergedRabbit = merged.snapshot.speciesProfiles.find((s) => s.name === 'Rabbit');
    expect(mergedRabbit?.targetWeightCurve).toHaveLength(2);
    expect(merged.snapshot.breedings[0].litterWeightMilestones?.[0].totalWeightGrams).toBe(3180);
  });

  it('renders family_portrait multi-photo pedigrees, iagarb_angora 7-position scorecards, and persists woolHarvests in backups', () => {
    const sire = makeAnimal('s1', {
      name: 'Boreal King',
      sex: 'Male',
      breed: 'German Angora',
      variety: 'White',
    });
    const dam = makeAnimal('d1', {
      name: 'Cloud Silk',
      sex: 'Female',
      breed: 'German Angora',
      variety: 'White',
    });
    const subject = makeAnimal('a1', {
      name: 'Snowdrift',
      tattoo: 'ANG01',
      sex: 'Female',
      breed: 'German Angora',
      variety: 'White',
      sireId: 's1',
      damId: 'd1',
    });
    const harvest = {
      id: 'wh-test-1',
      species: 'Rabbit',
      animalId: 'a1',
      harvestDateIso: '2026-06-01',
      shearingIntervalDays: 90,
      primeWeightGrams: 280,
      gradeWeightGrams: 80,
      harvestMethod: 'Shear' as const,
      stapleLengthMm: 78,
      iagarbScore: {
        weightPts: 19,
        bodyTypePts: 18,
        densityLengthPts: 13.5,
        uniformityPts: 13,
        texturePts: 14,
        furnishingsPts: 8.5,
        conditionPts: 4.5,
        totalPts: 90.5,
        evaluatorName: 'E. Registrar',
        evaluationDateIso: '2026-06-01',
      },
      notes: 'Clean uniform staple',
      createdAt: '2026-06-01T10:00:00.000Z',
      updatedAt: '2026-06-01T10:00:00.000Z',
    };

    const samplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const familyHtml = generateEvansHtmPedigree(
      subject,
      [subject, sire, dam],
      [makeSpeciesProfile('Rabbit')],
      makeSettings(),
      3,
      samplePng,
      {
        layoutPreset: 'family_portrait',
        ancestorPhotosByAnimalId: {
          s1: samplePng,
          d1: samplePng,
        },
        woolHarvests: [harvest],
      }
    );
    expect(familyHtml).toContain('Boreal King');
    expect(familyHtml).toContain('360g total');
    expect(familyHtml).toContain('family-strip');
    expect(familyHtml).toContain('anc-photo');

    const iagarbHtml = generateEvansHtmPedigree(
      subject,
      [subject, sire, dam],
      [makeSpeciesProfile('Rabbit')],
      makeSettings(),
      3,
      samplePng,
      {
        layoutPreset: 'iagarb_angora',
        woolHarvests: [harvest],
      }
    );
    expect(iagarbHtml).toContain('IAGARB German Angora Wool &amp; Evaluation Standard');
    expect(iagarbHtml).toContain('90.5 / 100 pts');
    expect(iagarbHtml).toContain('360g/90d');
    expect(iagarbHtml).toContain('90.5/100');

    const snap = makeEmptySnapshot({
      animals: [subject, sire, dam],
      woolHarvests: [harvest],
    });
    const parsed = parseBarnBackupJson(exportBarnBackupJson(snap), makeSettings());
    expect(parsed.woolHarvests).toHaveLength(1);
    expect(parsed.woolHarvests?.[0].primeWeightGrams).toBe(280);
    expect(parsed.woolHarvests?.[0].iagarbScore?.totalPts).toBe(90.5);
  });

  it('round-trips mileageLogs, journalEntries, and weatherForecast settings across JSON export/merge/delta-sync/purge', () => {
    const ml: MileageLog = {
      id: 'ml-round-1',
      species: 'Rabbit',
      dateIso: '2026-11-12',
      purpose: 'Show Travel',
      origin: 'Home Barn',
      destination: 'State Expo',
      roundTrip: true,
      miles: 145,
      odometerStart: 12000,
      odometerEnd: 12145,
      rateCentsPerMile: 70,
      parkingAndTollsCents: 1500,
      vehicleLabel: 'Barn Truck',
      taxDeductible: true,
      notes: 'Winter Convention trip',
      createdAt: '2026-11-12T10:00:00.000Z',
      updatedAt: '2026-11-12T10:00:00.000Z',
    };
    const je: BarnJournalEntry = {
      id: 'je-round-1',
      species: 'Rabbit',
      entryDateIso: '2026-11-12',
      title: 'Travel & Judging Observations',
      body: '- [x] Pack carriers\nGood coat density notes.',
      colorCategory: 'plum',
      starRating: 5,
      tags: ['show', 'coat'],
      pinned: true,
      linkedAnimalIds: [],
      createdAt: '2026-11-12T18:00:00.000Z',
      updatedAt: '2026-11-12T18:00:00.000Z',
    };

    const snap = makeEmptySnapshot({
      settings: makeSettings({
        weatherForecast: {
          enabled: true,
          locationLabel: 'Columbus, Ohio, US',
          latitude: 39.9612,
          longitude: -82.9988,
          temperatureUnit: 'F',
        },
      }),
      mileageLogs: [ml],
      journalEntries: [je],
    });

    const parsed = parseBarnBackupJson(exportBarnBackupJson(snap), makeSettings());
    expect(parsed.mileageLogs).toHaveLength(1);
    expect(parsed.mileageLogs?.[0].parkingAndTollsCents).toBe(1500);
    expect(parsed.journalEntries).toHaveLength(1);
    expect(parsed.journalEntries?.[0].starRating).toBe(5);
    expect(parsed.journalEntries?.[0].tags).toEqual(['show', 'coat']);
    expect(parsed.settings.weatherForecast?.enabled).toBe(true);
    expect(parsed.settings.weatherForecast?.locationLabel).toBe('Columbus, Ohio, US');

    // Merge & delta sync outbox verification
    const base = makeEmptySnapshot();
    const merged = mergeBarnSnapshots(base, parsed);
    expect(merged.snapshot.mileageLogs).toHaveLength(1);
    expect(merged.snapshot.journalEntries).toHaveLength(1);

    let counter = 1;
    const ops = diffSnapshotsToSyncOperations({
      previous: base,
      next: snap,
      deviceId: 'dev-a',
      nextCounter: () => counter++,
      timestamp: '2026-11-12T19:00:00.000Z',
    });
    expect(ops.some((op) => op.entity_type === 'mileageLog')).toBe(true);
    expect(ops.some((op) => op.entity_type === 'journalEntry')).toBe(true);

    const deltaApplied = mergeDeltaOperations(base, [], ops, 'dev-b');
    expect(deltaApplied.nextSnapshot.mileageLogs).toHaveLength(1);
    expect(deltaApplied.nextSnapshot.journalEntries).toHaveLength(1);

    // Non-testing purge must clear mileage & journal records for the target species
    expect(countSpeciesNonTestingRecords(snap, 'Rabbit')).toBeGreaterThanOrEqual(2);
    const purged = purgeSpeciesNonTestingDataPure(snap, 'Rabbit');
    expect(purged.nextSnapshot.mileageLogs).toHaveLength(0);
    expect(purged.nextSnapshot.journalEntries).toHaveLength(0);
  });
});

