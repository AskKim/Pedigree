import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildExporterCatalog,
  BUILTIN_NON_NATIVE_EXPORTERS,
  EXTERNAL_EXPORTERS,
  getExternalExporterById,
  PLANNED_EXTERNAL_SCHEMA_TARGETS,
  runExternalExporter,
} from '../exporters/registry';
import type { ExternalExporterDescriptor } from '../exporters/exporterTypes';
import { HerdBossImporter } from '../importers/herdBossImporter';
import { buildFullPredefinedSampleSnapshot } from '../sampleData';

describe('exporters/registry — extensible non-native format exporters', () => {
  it('registers all built-in ready exporters and external schemas with unique IDs', () => {
    const ids = new Set<string>();
    for (const exp of EXTERNAL_EXPORTERS) {
      expect(exp.id.trim().length).toBeGreaterThan(0);
      expect(ids.has(exp.id)).toBe(false);
      ids.add(exp.id);
      if (exp.status === 'ready') {
        expect(typeof exp.exportPayload).toBe('function');
      }
    }
    expect(BUILTIN_NON_NATIVE_EXPORTERS.length).toBeGreaterThanOrEqual(8);
    expect(PLANNED_EXTERNAL_SCHEMA_TARGETS).toHaveLength(0);
    expect(getExternalExporterById('clean-csv')?.formatExtension).toBe('.CSV');
    expect(getExternalExporterById('breeder-showcase-html')?.status).toBe('ready');
    expect(getExternalExporterById('herdboss-transfer-bundle')?.status).toBe('ready');
    expect(getExternalExporterById('registry-worksheet-csv')?.status).toBe('ready');
  });

  it('executes CSV, Evans .HTM, Breeder Showcase .HTML, Barn Binder .HTM, Report DTO .JSON, .ICS, HerdBoss .ZIP, and Registry Worksheet .CSV in pure TS', () => {
    const snapshot = buildFullPredefinedSampleSnapshot();
    const rabbit = snapshot.animals.find((a) => a.species === 'Rabbit')!;

    const csv = runExternalExporter('clean-csv', {
      snapshot,
      speciesName: 'Rabbit',
    });
    expect(csv.filename.endsWith('.csv')).toBe(true);
    expect(csv.content.charCodeAt(0)).toBe(0xfeff);
    expect(csv.recordCount).toBeGreaterThan(0);

    const evans = runExternalExporter('evans-htm', {
      snapshot,
      speciesName: 'Rabbit',
      animalId: rabbit.id,
      generations: 8,
    });
    expect(evans.filename.endsWith('.htm')).toBe(true);
    expect(evans.content).toContain(rabbit.name);
    expect(evans.content).toContain('8-Generation');

    const card = runExternalExporter('shareable-pedigree-card', {
      snapshot,
      speciesName: 'Rabbit',
      animalId: rabbit.id,
      generations: 6,
    });
    expect(card.filename.endsWith('.html')).toBe(true);
    expect(card.mimeType).toBe('text/html;charset=utf-8');
    expect(card.content).toContain(rabbit.name);
    expect(card.content).toContain('3-Generation Lineage Summary');

    const emptyShowcase = runExternalExporter('breeder-showcase-html', {
      snapshot,
      speciesName: 'Rabbit',
    });
    expect(emptyShowcase.filename.endsWith('.html')).toBe(true);
    expect(emptyShowcase.recordCount).toBe(0);
    expect(emptyShowcase.warnings.some((w) => w.includes('empty storefront'))).toBe(true);

    const populatedShowcase = runExternalExporter('breeder-showcase-html', {
      snapshot: {
        ...snapshot,
        animals: snapshot.animals.map((a) =>
          a.id === rabbit.id
            ? {
                ...a,
                status: 'Active',
                archived: false,
                ownershipType: 'Owned',
                forSale: true,
                askingPriceCents: 12_500,
              }
            : a
        ),
      },
      speciesName: 'Rabbit',
      appBaseUrl: 'https://example.org/Pedigree/',
    });
    expect(populatedShowcase.filename.endsWith('.html')).toBe(true);
    expect(populatedShowcase.mimeType).toBe('text/html;charset=utf-8');
    expect(populatedShowcase.recordCount).toBe(1);
    expect(populatedShowcase.content).toContain(rabbit.name);
    expect(populatedShowcase.content).toContain('$125.00');

    const binder = runExternalExporter('barn-binder-htm', {
      snapshot,
      speciesName: 'Rabbit',
      includeArchived: false,
    });
    expect(binder.filename.endsWith('.htm')).toBe(true);
    expect(binder.content).toContain('Rabbit');

    const dto = runExternalExporter('pdf-report-dto-json', {
      snapshot,
      speciesName: 'Rabbit',
    });
    expect(dto.filename.endsWith('.json')).toBe(true);
    const parsedDto = JSON.parse(dto.content);
    expect(parsedDto.filterSpecies).toBe('Rabbit');
    expect(Array.isArray(parsedDto.animals)).toBe(true);

    const ics = runExternalExporter('calendar-ics', {
      snapshot: {
        ...snapshot,
        tasks: [
          ...snapshot.tasks,
          {
            id: 'task-export-test',
            species: 'Rabbit',
            title: 'Kindling Nestbox Check',
            category: 'Birth Check',
            priority: 'High',
            dueDateIso: '2026-11-25',
            linkedAnimalId: rabbit.id,
            linkedAnimalName: rabbit.name,
            linkedBreedingId: '',
            completed: false,
            createdAt: '2026-11-18T12:00:00Z',
            updatedAt: '2026-11-18T12:00:00Z',
          },
        ],
      },
      speciesName: 'Rabbit',
    });
    expect(ics.filename.endsWith('.ics')).toBe(true);
    expect(ics.content).toContain('BEGIN:VCALENDAR');
    expect(ics.content).toContain('Kindling Nestbox Check');

    const hbZip = runExternalExporter('herdboss-transfer-bundle', {
      snapshot,
      speciesName: 'Rabbit',
    });
    expect(hbZip.filename.endsWith('.zip')).toBe(true);
    expect(hbZip.mimeType).toBe('application/zip');
    expect(hbZip.binaryContent).toBeInstanceOf(Uint8Array);
    const unpacked = unzipSync(hbZip.binaryContent!);
    expect(Object.keys(unpacked).sort()).toEqual([
      'animals.csv',
      'breedings.csv',
      'pedigree_links.csv',
      'weights.csv',
    ]);
    const animalsCsvBytes = unpacked['animals.csv'];
    expect(Array.from(animalsCsvBytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const animalsCsvText = strFromU8(animalsCsvBytes);
    expect(animalsCsvText).toContain(rabbit.name);

    // Round-trip verification back through HerdBossImporter into a clean snapshot
    const emptySnapshot = {
      ...snapshot,
      animals: [],
      breedings: [],
      careLogs: [],
    };
    const reimportPreview = HerdBossImporter.parse(
      [{ fileName: hbZip.filename, bytes: hbZip.binaryContent! }],
      emptySnapshot,
      { fallbackSpeciesName: 'Rabbit' }
    );
    expect(reimportPreview.animals.some((a) => a.name === rabbit.name)).toBe(true);

    const worksheet = runExternalExporter('registry-worksheet-csv', {
      snapshot,
      speciesName: 'Rabbit',
    });
    expect(worksheet.filename.endsWith('.csv')).toBe(true);
    expect(worksheet.content.charCodeAt(0)).toBe(0xfeff);
    expect(worksheet.content).toContain('Gen3_Pat_Grandsire');
    expect(worksheet.content).toContain(rabbit.name);
  });

  it('supports extending or overriding catalog entries and rejects unknown or planned IDs', () => {
    const customSchema: ExternalExporterDescriptor = {
      id: 'kintracs-custom-csv',
      name: 'Kintracs Transfer CSV',
      formatExtension: '.CSV',
      category: 'external_schema',
      targetPlatform: 'Kintracs',
      scopeMode: 'all_or_species',
      supportsSpeciesFilter: true,
      status: 'ready',
      description: 'Custom external schema extension test.',
      compatibilityNote: 'Pure extensible registry test.',
      exportPayload: ({ snapshot }) => ({
        exporterId: 'kintracs-custom-csv',
        filename: 'kintracs-export.csv',
        mimeType: 'text/csv;charset=utf-8',
        content: `Count\n${snapshot.animals.length}`,
        recordCount: snapshot.animals.length,
        summary: 'Custom export succeeded.',
        warnings: [],
      }),
    };
    const plannedSchema: ExternalExporterDescriptor = {
      id: 'future-planned-schema',
      name: 'Future Planned Format',
      formatExtension: '.CSV',
      category: 'external_schema',
      targetPlatform: 'Future',
      scopeMode: 'all_or_species',
      supportsSpeciesFilter: true,
      status: 'planned',
      description: 'Reserved slot.',
      compatibilityNote: 'Planned.',
    };

    const extendedCatalog = buildExporterCatalog([customSchema, plannedSchema]);
    const snapshot = buildFullPredefinedSampleSnapshot();
    const res = runExternalExporter('kintracs-custom-csv', { snapshot }, extendedCatalog);
    expect(res.filename).toBe('kintracs-export.csv');
    expect(res.recordCount).toBe(snapshot.animals.length);

    expect(() =>
      runExternalExporter('future-planned-schema', { snapshot }, extendedCatalog)
    ).toThrow(/planned external schema target/i);
  });
});
