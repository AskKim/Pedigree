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
import { buildFullPredefinedSampleSnapshot } from '../sampleData';

describe('exporters/registry — extensible non-native format exporters', () => {
  it('registers all built-in ready exporters and planned external schema targets with unique IDs', () => {
    const ids = new Set<string>();
    for (const exp of EXTERNAL_EXPORTERS) {
      expect(exp.id.trim().length).toBeGreaterThan(0);
      expect(ids.has(exp.id)).toBe(false);
      ids.add(exp.id);
      if (exp.status === 'ready') {
        expect(typeof exp.exportPayload).toBe('function');
      }
    }
    expect(BUILTIN_NON_NATIVE_EXPORTERS.length).toBeGreaterThanOrEqual(5);
    expect(PLANNED_EXTERNAL_SCHEMA_TARGETS.length).toBeGreaterThanOrEqual(1);
    expect(getExternalExporterById('clean-csv')?.formatExtension).toBe('.CSV');
  });

  it('executes CSV, Evans .HTM, Barn Binder .HTM, Report DTO .JSON, and .ICS exporters in pure TS', () => {
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
      generations: 4,
    });
    expect(evans.filename.endsWith('.htm')).toBe(true);
    expect(evans.content).toContain(rabbit.name);
    expect(evans.content).toContain('4-Generation');

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
  });

  it('supports extending or overriding catalog entries cleanly without UI code changes', () => {
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

    const extendedCatalog = buildExporterCatalog([customSchema]);
    const snapshot = buildFullPredefinedSampleSnapshot();
    const res = runExternalExporter('kintracs-custom-csv', { snapshot }, extendedCatalog);
    expect(res.filename).toBe('kintracs-export.csv');
    expect(res.recordCount).toBe(snapshot.animals.length);

    expect(() => runExternalExporter('herdboss-transfer-bundle', { snapshot })).toThrow(
      /planned external schema target/i
    );
  });
});
