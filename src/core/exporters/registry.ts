/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Central Non-Native & Extensible External Exporter Registry (`src/core/exporters/registry.ts`).
 *
 * Mirrors `src/core/importers/registry.ts` so every non-native format or future external platform
 * schema (CSV spreadsheets, Evans .HTM, Printable Barn Binders, Report DTO JSON, .ICS calendars,
 * and future HerdBoss / Kintracs / Registry CSV schemas) registers in one declarative structure
 * with zero UI rewrite.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) dependencies.
 */

import {
  buildBarnBinderFileName,
  buildDefaultBarnBinderOptions,
  generateSpeciesBarnBinderHtml,
} from '../barnBinder';
import { buildIcsCalendarForTasks } from '../calendarExport';
import { buildCleanCsvExportFileName, exportAnimalsCsv } from '../csvExport';
import {
  isSameSpecies,
  normalizeDefaultPedigreeGenerations,
  normalizePedigreeGenerationDepth,
  nowIsoUtc,
} from '../models';
import {
  buildShareablePedigreeCardFileName,
  generateShareablePedigreeCardHtml,
} from '../shareablePedigreeCard';
import {
  buildPdfReadyBarnSnapshot,
  generateEvansHtmPedigree,
} from '../syncAndExports';
import type {
  ExportedArtifactPayload,
  ExporterExecutionContext,
  ExternalExporterDescriptor,
} from './exporterTypes';

function sanitizeFileSlug(raw: string | undefined, fallback: string): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function getLocalDateSlug(): string {
  return nowIsoUtc().slice(0, 10);
}

export const BUILTIN_NON_NATIVE_EXPORTERS: readonly ExternalExporterDescriptor[] = [
  {
    id: 'clean-csv',
    name: 'Herd Roster Spreadsheet',
    formatExtension: '.CSV',
    category: 'spreadsheet',
    targetPlatform: 'Excel / Google Sheets / LibreOffice',
    scopeMode: 'all_or_species',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'RFC-4180 UTF-8 BOM spreadsheet with human-readable sire/dam names, tattoos, weights, COI, genotypes, and carrier disclosures.',
    compatibilityNote:
      'Sanitizes spreadsheet formula prefixes (=, +, -, @) while preserving numeric signs and photo filenames.',
    schemaFields: [
      'Species',
      'Tattoo / ID',
      'Name',
      'Breed & Variety',
      'Sire / Dam Resolved Refs',
      'Genotype & Carriers',
      'Lifecycle & Financials',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName } = context;
      const scopedSpecies = speciesName?.trim() || undefined;
      const scopedAnimals = scopedSpecies
        ? snapshot.animals.filter((a) => isSameSpecies(a.species, scopedSpecies))
        : snapshot.animals;
      const filename = buildCleanCsvExportFileName(
        snapshot.settings.barnName,
        scopedSpecies,
        getLocalDateSlug()
      );
      const content = exportAnimalsCsv(
        snapshot.animals,
        snapshot.speciesProfiles,
        snapshot.settings,
        scopedSpecies,
        snapshot.animalPhotos ?? []
      );
      return {
        exporterId: 'clean-csv',
        filename,
        mimeType: 'text/csv;charset=utf-8',
        content,
        recordCount: scopedAnimals.length,
        summary: `Exported ${scopedAnimals.length} ${
          scopedSpecies ? `${scopedSpecies} ` : ''
        }animal record(s) to ${filename} with resolved parent names & tattoos.`,
        warnings:
          scopedAnimals.length === 0
            ? ['Header row exported cleanly, though zero animals matched the current scope.']
            : [],
      };
    },
  },
  {
    id: 'evans-htm',
    name: 'Evans Pedigree Certificate',
    formatExtension: '.HTM',
    category: 'pedigree_document',
    targetPlatform: 'Evans Software / Browser / Print PDF',
    scopeMode: 'single_animal',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Standalone multi-generation .HTM pedigree certificate formatted for external sharing, registry submission, and archival printing.',
    compatibilityNote:
      'Embeds optional subject photo and Breeder Certification signature block on clean light paper CSS.',
    schemaFields: [
      '3–8 Gen Ancestor Matrix',
      'Wright COI %',
      'Genotype & Carriers',
      'Reg / GC / Legs',
      'Certification Block',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, animalId, generations } = context;
      const subject =
        snapshot.animals.find((a) => a.id === animalId) ||
        (context.speciesName
          ? snapshot.animals.find((a) => isSameSpecies(a.species, context.speciesName!))
          : snapshot.animals[0]);

      if (!subject) {
        throw new Error('Select an animal to export an Evans-compatible .HTM pedigree.');
      }

      const depth = normalizePedigreeGenerationDepth(
        generations ?? snapshot.settings.defaultGenerations,
        3
      );

      const primaryPhoto = (snapshot.animalPhotos ?? [])
        .filter((p) => p.animalId === subject.id)
        .sort((a, b) => (a.isPrimary === b.isPrimary ? a.sortOrder - b.sortOrder : a.isPrimary ? -1 : 1))[0];

      const html = generateEvansHtmPedigree(
        subject,
        snapshot.animals,
        snapshot.speciesProfiles,
        snapshot.settings,
        depth,
        snapshot.settings.includePhotoOnPedigree !== false
          ? primaryPhoto?.dataUrl || primaryPhoto?.thumbnailDataUrl
          : undefined,
        {
          shows: snapshot.shows,
          careLogs: snapshot.careLogs,
        }
      );

      const slug = sanitizeFileSlug(subject.tattoo || subject.name, 'animal');
      const filename = `pedigree-${slug}-${depth}gen-${getLocalDateSlug()}.htm`;
      return {
        exporterId: 'evans-htm',
        filename,
        mimeType: 'text/html;charset=utf-8',
        content: html,
        recordCount: 1,
        summary: `Exported ${depth}-generation Evans-compatible .HTM pedigree for ${subject.name}${
          subject.tattoo ? ` (${subject.tattoo})` : ''
        }.`,
        warnings: [],
      };
    },
  },
  {
    id: 'shareable-pedigree-card',
    name: 'Shareable Pedigree Card',
    formatExtension: '.HTML',
    category: 'pedigree_document',
    targetPlatform: 'Mobile Browser / Messaging / Buyer Packet',
    scopeMode: 'single_animal',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Lightweight standalone mobile-first HTML summary card with COI badge, honors, 3-generation tree, and optional collapsible Gen 4–8 lineage.',
    compatibilityNote:
      'Zero external scripts or fonts; embeds optional portrait, barn logo, and scannable QR profile badge.',
    schemaFields: [
      'Hero Portrait & Honors',
      'Wright COI Badge',
      '3-Gen Visual Grid',
      'Collapsible Gen 4–8 Ancestry',
      'Optional Profile QR',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, animalId, generations, appBaseUrl } = context;
      const subject =
        snapshot.animals.find((a) => a.id === animalId) ||
        (context.speciesName
          ? snapshot.animals.find((a) => isSameSpecies(a.species, context.speciesName!))
          : snapshot.animals[0]);

      if (!subject) {
        throw new Error('Select an animal to export a Shareable Pedigree Card.');
      }

      const depth = normalizePedigreeGenerationDepth(
        generations ?? snapshot.settings.defaultGenerations,
        3
      );

      const primaryPhoto = (snapshot.animalPhotos ?? [])
        .filter((p) => p.animalId === subject.id)
        .sort((a, b) => (a.isPrimary === b.isPrimary ? a.sortOrder - b.sortOrder : a.isPrimary ? -1 : 1))[0];

      const html = generateShareablePedigreeCardHtml(
        subject,
        snapshot.animals,
        snapshot.speciesProfiles,
        snapshot.settings,
        depth,
        snapshot.settings.includePhotoOnPedigree !== false
          ? primaryPhoto?.dataUrl || primaryPhoto?.thumbnailDataUrl
          : undefined,
        {
          shows: snapshot.shows,
          careLogs: snapshot.careLogs,
          appBaseUrl,
          includeQrCode: Boolean(appBaseUrl),
        }
      );

      const filename = buildShareablePedigreeCardFileName(subject);
      return {
        exporterId: 'shareable-pedigree-card',
        filename,
        mimeType: 'text/html;charset=utf-8',
        content: html,
        recordCount: 1,
        summary: `Exported lightweight ${depth}-gen Shareable Pedigree Card (${filename}) for ${subject.name}.`,
        warnings: [],
      };
    },
  },
  {
    id: 'barn-binder-htm',
    name: 'Printable Herd & Barn Binder',
    formatExtension: '.HTM',
    category: 'pedigree_document',
    targetPlatform: 'Offline Browser / Print-to-PDF Herd Book',
    scopeMode: 'species_required',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Complete per-species offline HTML reference book with TOC, herd sheets, embedded pedigrees, breedings, cages, shows, and memo.',
    compatibilityNote:
      'Strictly scoped to one livestock species so terminology, gestation schedules, and weight units stay consistent.',
    schemaFields: [
      'Cover & TOC',
      'Species Schedule & Memo',
      'Animal Profile Cards & Photos',
      'Pedigrees & Kinship',
      'Medical & Breeding Logs',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName, includeArchived, generations } = context;
      const targetSpecies =
        speciesName?.trim() ||
        snapshot.settings.defaultSpecies ||
        snapshot.speciesProfiles[0]?.name ||
        'Rabbit';

      const binderGenerations = normalizeDefaultPedigreeGenerations(
        generations ?? snapshot.settings.defaultGenerations,
        3
      );
      const options = buildDefaultBarnBinderOptions(snapshot.settings, {
        includeArchived: Boolean(includeArchived),
        generations: binderGenerations,
      });
      const html = generateSpeciesBarnBinderHtml(snapshot, targetSpecies, options);
      const filename = buildBarnBinderFileName(
        snapshot.settings.barnName,
        targetSpecies,
        getLocalDateSlug()
      );
      const speciesAnimalCount = snapshot.animals.filter((a) =>
        isSameSpecies(a.species, targetSpecies)
      ).length;

      return {
        exporterId: 'barn-binder-htm',
        filename,
        mimeType: 'text/html;charset=utf-8',
        content: html,
        recordCount: speciesAnimalCount,
        summary: `Exported ${targetSpecies} Barn Binder (${filename}) covering ${speciesAnimalCount} ${targetSpecies} record(s).`,
        warnings:
          speciesAnimalCount === 0
            ? [`No ${targetSpecies} animals found yet — exported an empty species binder shell.`]
            : [],
      };
    },
  },
  {
    id: 'pdf-report-dto-json',
    name: 'Normalized Species Report DTO',
    formatExtension: '.JSON',
    category: 'report_dto',
    targetPlatform: 'Custom Report Pipelines / Audit Spreadsheets / Print Tools',
    scopeMode: 'all_or_species',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Clean flat JSON projection resolving formatted weights, Wright COI %, carrier disclosures, sire/dam summaries, and disposition dates.',
    compatibilityNote:
      'Built for external reporting scripts or downstream print pipelines—distinct from native system restore backups.',
    schemaFields: [
      'barnName / breederName',
      'openTasksCount / activeBreedingsCount',
      'Resolved Animal DTO Rows',
      'COI % & Carrier Disclosures',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName } = context;
      const scopedSpecies = speciesName?.trim() || undefined;
      const dto = buildPdfReadyBarnSnapshot(snapshot, scopedSpecies);
      const slug = scopedSpecies
        ? `barn-report-${sanitizeFileSlug(scopedSpecies, 'species')}-${getLocalDateSlug()}.json`
        : `barn-report-all-species-${getLocalDateSlug()}.json`;

      return {
        exporterId: 'pdf-report-dto-json',
        filename: slug,
        mimeType: 'application/json;charset=utf-8',
        content: JSON.stringify(dto, null, 2),
        recordCount: dto.totalAnimals,
        summary: `Exported ${dto.totalAnimals} normalized report DTO record(s) to ${slug}.`,
        warnings: [],
      };
    },
  },
  {
    id: 'calendar-ics',
    name: 'Barn Chores & Breeding Calendar',
    formatExtension: '.ICS',
    category: 'calendar',
    targetPlatform: 'Apple Calendar / Outlook / Thunderbird / Google Import',
    scopeMode: 'open_tasks',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Standard RFC-5545 .ics calendar feed exporting all open dated chores, palpations, kindling/birth due dates, and weaning reminders.',
    compatibilityNote:
      'Works 100% offline with VALARM reminders and stable UIDs so re-importing into external calendars updates cleanly.',
    schemaFields: ['VCALENDAR 2.0', 'VEVENT DTSTART/DTEND', 'VALARM Trigger', 'App Deep Links'],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName, appBaseUrl } = context;
      const scopedSpecies = speciesName?.trim() || undefined;
      const openTasks = snapshot.tasks.filter(
        (t) =>
          !t.completed &&
          (!scopedSpecies || isSameSpecies(t.species, scopedSpecies))
      );

      const generated = buildIcsCalendarForTasks(
        openTasks,
        snapshot.settings.calendarSync,
        snapshot.settings.barnName || 'Community Pedigree',
        scopedSpecies ? `${sanitizeFileSlug(scopedSpecies, 'barn')}-chores` : 'all-barn-chores',
        {
          animals: snapshot.animals,
          breedings: snapshot.breedings,
          speciesProfiles: snapshot.speciesProfiles,
          appBaseUrl,
        }
      );

      if (!generated) {
        throw new Error(
          `No open tasks with valid due dates found${
            scopedSpecies ? ` for ${scopedSpecies}` : ''
          }.`
        );
      }

      return {
        exporterId: 'calendar-ics',
        filename: generated.filename,
        mimeType: 'text/calendar;charset=utf-8',
        content: generated.icsContent,
        recordCount: generated.eventCount,
        summary: `Exported ${generated.eventCount} open scheduled chore(s) to ${generated.filename}.`,
        warnings: [],
      };
    },
  },
];

export const PLANNED_EXTERNAL_SCHEMA_TARGETS: readonly ExternalExporterDescriptor[] = [
  {
    id: 'herdboss-transfer-bundle',
    name: 'HerdBoss Transfer Tables',
    formatExtension: '.CSV / .ZIP',
    category: 'external_schema',
    targetPlatform: 'HerdBoss Schema Target',
    scopeMode: 'all_or_species',
    supportsSpeciesFilter: true,
    status: 'planned',
    description:
      'Relational CSV bundle mapping animals, breedings, litters, and weight logs back into HerdBoss column conventions.',
    compatibilityNote:
      'Extensible schema slot reserved; HerdBoss multi-ZIP/CSV import is already active in Section 2.',
    schemaFields: ['animals.csv', 'breedings.csv', 'weights.csv', 'pedigree_links.csv'],
  },
  {
    id: 'registry-worksheet-csv',
    name: 'Breed Registry & Show Worksheets',
    formatExtension: '.CSV',
    category: 'external_schema',
    targetPlatform: 'ARBA / ADGA / Custom Registry Forms',
    scopeMode: 'species_required',
    supportsSpeciesFilter: true,
    status: 'planned',
    description:
      'Targeted per-species worksheet columns tailored for registration applications, show entry secretaries, and external pedigree transfers.',
    compatibilityNote:
      'Use Herd Roster Spreadsheet (.CSV) or Printable Barn Binder (.HTM) today for full registration details.',
    schemaFields: ['Reg #', 'Ear Tattoo', '3-Gen Ancestor Reg #s', 'Legs / GC', 'Breeder Contact'],
  },
];

export function buildExporterCatalog(
  additionalExporters: readonly ExternalExporterDescriptor[] = []
): ExternalExporterDescriptor[] {
  const byId = new Map<string, ExternalExporterDescriptor>();
  for (const exp of BUILTIN_NON_NATIVE_EXPORTERS) {
    byId.set(exp.id, exp);
  }
  for (const exp of additionalExporters) {
    byId.set(exp.id, exp);
  }
  for (const exp of PLANNED_EXTERNAL_SCHEMA_TARGETS) {
    if (!byId.has(exp.id)) {
      byId.set(exp.id, exp);
    }
  }
  return Array.from(byId.values());
}

export const EXTERNAL_EXPORTERS: readonly ExternalExporterDescriptor[] = buildExporterCatalog();

export function getExternalExporterById(
  id: string,
  catalog: readonly ExternalExporterDescriptor[] = EXTERNAL_EXPORTERS
): ExternalExporterDescriptor | undefined {
  return catalog.find((exp) => exp.id === id);
}

export function runExternalExporter(
  id: string,
  context: ExporterExecutionContext,
  catalog: readonly ExternalExporterDescriptor[] = EXTERNAL_EXPORTERS
): ExportedArtifactPayload {
  const exporter = getExternalExporterById(id, catalog);
  if (!exporter) {
    throw new Error(`Unknown exporter "${id}".`);
  }
  if (exporter.status !== 'ready' || typeof exporter.exportPayload !== 'function') {
    throw new Error(
      `Exporter "${exporter.name}" is registered as a planned external schema target and is not yet active.`
    );
  }
  return exporter.exportPayload(context);
}
