/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Central Non-Native & Extensible External Exporter Registry (`src/domain/exporters/registry.ts`).
 *
 * Mirrors `src/domain/importers/registry.ts` so every non-native format or future external platform
 * schema (CSV spreadsheets, Evans .HTM, Printable Barn Binders, Report DTO JSON, .ICS calendars,
 * and future HerdBoss / Kintracs / Registry CSV schemas) registers in one declarative structure
 * with zero UI rewrite.
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) dependencies.
 */

import { strToU8, zipSync } from 'fflate';
import {
  buildBarnBinderFileName,
  buildDefaultBarnBinderOptions,
  generateSpeciesBarnBinderHtml,
} from '../barnBinder';
import { buildBreederShowcaseResult } from '../breederShowcase';
import { buildIcsCalendarForTasks } from '../calendarExport';
import {
  analyzeAnimalCarrierLineage,
  formatClearedProofBadge,
  getAnimalCarrierDisclosures,
} from '../carrierGenetics';
import {
  buildCleanCsvExportFileName,
  escapeCsvCell,
  exportAnimalsCsv,
  UTF8_BOM,
} from '../csvExport';
import { formatGenotypeArray } from '../geneticsEngine';
import {
  Animal,
  formatSexForSpecies,
  formatWeight,
  isAnimalArchived,
  isSameSpecies,
  normalizeDefaultPedigreeGenerations,
  normalizePedigreeGenerationDepth,
  nowIsoUtc,
  resolveSpeciesProfile,
  resolveSpeciesWeightUnit,
} from '../models';
import { buildSpeciesHerdMap } from '../pedigreeCalculator';
import {
  buildShareablePedigreeCardFileName,
  generateShareablePedigreeCardHtml,
} from '../shareablePedigreeCard';
import {
  buildPdfReadyBarnSnapshot,
  generateEvansHtmPedigree,
} from '../syncAndExports';
import {
  buildGenericExporterCatalog,
  createGenericExporterRegistry,
} from '@engine/primitives/genericRegistries';
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

function buildCsvDocument(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return `${UTF8_BOM}${lines.join('\r\n')}`;
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
    id: 'breeder-showcase-html',
    name: 'Zero-Server Breeder Showcase & For-Sale Catalog',
    formatExtension: '.HTML',
    category: 'pedigree_document',
    targetPlatform: 'Static Web Hosting / Buyer Catalog / Stock Sheet',
    scopeMode: 'all_or_species',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Self-contained static HTML showcase page and printable buyer stock sheet built from animals marked For Sale—with photos, asking prices, 2-gen pedigrees, show honors, and breeder contact links.',
    compatibilityNote:
      'Zero external CDNs or server required; host free on GitHub Pages / Netlify / Neocities or share directly offline.',
    schemaFields: [
      'For-Sale Filter & Asking Prices',
      'Embedded Portraits',
      '2-Gen Pedigree & COI',
      'Show & Carrier Highlights',
      'Breeder Contact & Printable Sheet',
    ],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName, appBaseUrl } = context;
      const scopedSpecies = speciesName?.trim() || undefined;
      const res = buildBreederShowcaseResult(snapshot, {
        speciesName: scopedSpecies,
        includePhotos: true,
        includePedigreeSummary: true,
        includeContactInfo: true,
        appBaseUrl,
        includeQrCode: Boolean(appBaseUrl),
      });

      const warnings = [...res.activeWithdrawalWarnings];
      if (res.animalCount === 0) {
        warnings.push(
          scopedSpecies
            ? `No ${scopedSpecies} records are currently marked Available For Sale — exported an empty storefront template.`
            : 'No animals are currently marked Available For Sale — exported an empty storefront template.'
        );
      }

      return {
        exporterId: 'breeder-showcase-html',
        filename: res.filename,
        mimeType: 'text/html;charset=utf-8',
        content: res.html,
        recordCount: res.animalCount,
        summary:
          res.animalCount > 0
            ? `Exported zero-server For-Sale Showcase (${res.filename}) featuring ${res.animalCount} animal${res.animalCount === 1 ? '' : 's'}${res.reservedCount > 0 ? ` (${res.reservedCount} on hold/reserved)` : ''}.`
            : `Exported Breeder Showcase template (${res.filename}) — mark animals "For Sale" in Herd to populate listings.`,
        warnings,
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
  {
    id: 'herdboss-transfer-bundle',
    name: 'HerdBoss Transfer Tables',
    formatExtension: '.ZIP',
    category: 'external_schema',
    targetPlatform: 'HerdBoss / Relational Herd CSV Archive',
    scopeMode: 'all_or_species',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Relational 4-table .ZIP bundle (animals.csv, breedings.csv, weights.csv, pedigree_links.csv) using HerdBoss-compatible columns for multi-table portability.',
    compatibilityNote:
      'Sanitizes spreadsheet formulas and re-imports cleanly through Section 2 HerdBoss importer with multi-gen ancestor linking.',
    schemaFields: ['animals.csv', 'breedings.csv', 'weights.csv', 'pedigree_links.csv'],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName } = context;
      const scopedSpecies = speciesName?.trim() || undefined;

      const animalById = new Map<string, Animal>();
      for (const a of snapshot.animals) {
        if (a.id) animalById.set(a.id, a);
      }

      const scopedAnimals = (
        scopedSpecies
          ? snapshot.animals.filter((a) => isSameSpecies(a.species, scopedSpecies))
          : snapshot.animals
      )
        .slice()
        .sort((a, b) => a.species.localeCompare(b.species) || a.name.localeCompare(b.name));

      const animalHeaders = [
        'Animal_ID',
        'Species',
        'Primary_Tag',
        'Tattoo',
        'Name',
        'Breed',
        'Variety',
        'Sex',
        'Birth_Date',
        'Status',
        'Sire_ID',
        'Sire',
        'Dam_ID',
        'Dam',
        'Weight',
        'Weight_Unit',
        'Genotype',
        'Rufus_Level',
        'Registration_Number',
        'Grand_Champion_Number',
        'Legs_Count',
        'Group_Location',
        'Breeder_Name',
        'Owner_Name',
        'Sold_Date',
        'Death_Date',
        'Notes',
      ];
      const animalRows = scopedAnimals.map((a) => {
        const sire = a.sireId ? animalById.get(a.sireId) : undefined;
        const dam = a.damId ? animalById.get(a.damId) : undefined;
        return [
          a.id,
          a.species,
          a.tattoo || a.id,
          a.tattoo,
          a.name,
          a.breed,
          a.variety,
          a.sex,
          a.birthDateIso,
          a.status,
          sire?.id || a.sireId || '',
          sire?.name || '',
          dam?.id || a.damId || '',
          dam?.name || '',
          a.weightGrams > 0 ? String(a.weightGrams) : '',
          a.weightGrams > 0 ? 'g' : '',
          a.genotypeRaw || formatGenotypeArray(a.genotype),
          a.rufusLevel || '',
          a.registrationNumber,
          a.grandChampionNumber,
          a.legsCount,
          a.cageLocation,
          a.breederName,
          a.ownerName,
          a.soldDateIso || '',
          a.deceasedDateIso || '',
          a.notes,
        ];
      });
      const animalsCsv = buildCsvDocument(animalHeaders, animalRows);

      const scopedBreedings = snapshot.breedings.filter(
        (b) => !scopedSpecies || isSameSpecies(b.species, scopedSpecies)
      );
      const breedingHeaders = [
        'Breeding_ID',
        'Species',
        'Sire_ID',
        'Sire',
        'Dam_ID',
        'Dam',
        'Bred_Date',
        'Expected_Due_Date',
        'Actual_Birth_Date',
        'Status',
        'Live_Count',
        'Stillborn_Count',
        'Weaned_Count',
        'Notes',
      ];
      const breedingRows = scopedBreedings.map((b) => {
        const sire = b.sireId ? animalById.get(b.sireId) : undefined;
        const dam = b.damId ? animalById.get(b.damId) : undefined;
        return [
          b.id,
          b.species,
          b.sireId,
          sire?.name || b.sireName,
          b.damId,
          dam?.name || b.damName,
          b.bredDateIso,
          b.expectedDueDateIso,
          b.actualBirthDateIso,
          b.status,
          b.liveCount,
          b.stillbornCount,
          b.weanedCount,
          b.notes,
        ];
      });
      const breedingsCsv = buildCsvDocument(breedingHeaders, breedingRows);

      const weightLogs = snapshot.careLogs.filter(
        (l) =>
          (l.type === 'Weight Check' || l.weightGrams > 0) &&
          (!scopedSpecies || isSameSpecies(l.species, scopedSpecies))
      );
      const weightHeaders = [
        'Species',
        'Animal_ID',
        'Primary_Tag',
        'Name',
        'Weigh_Date',
        'Weight',
        'Weight_Unit',
        'Stage',
        'Notes',
      ];
      const weightRows = weightLogs.map((l) => {
        const animal = animalById.get(l.animalId);
        return [
          l.species,
          l.animalId,
          animal?.tattoo || l.animalId,
          animal?.name || '',
          l.dateIso,
          l.weightGrams > 0 ? String(l.weightGrams) : '',
          l.weightGrams > 0 ? 'g' : '',
          l.title || 'Weight Check',
          l.notes,
        ];
      });
      const weightsCsv = buildCsvDocument(weightHeaders, weightRows);

      const pedigreeHeaders = [
        'Species',
        'Animal_ID',
        'Primary_Tag',
        'Name',
        'Sire_ID',
        'Sire_Tag',
        'Sire_Name',
        'Dam_ID',
        'Dam_Tag',
        'Dam_Name',
        'Paternal_Grandsire',
        'Paternal_Granddam',
        'Maternal_Grandsire',
        'Maternal_Granddam',
      ];
      const pedigreeRows = scopedAnimals
        .filter((a) => Boolean(a.sireId || a.damId))
        .map((a) => {
          const sire = a.sireId ? animalById.get(a.sireId) : undefined;
          const dam = a.damId ? animalById.get(a.damId) : undefined;
          const pgs = sire?.sireId ? animalById.get(sire.sireId) : undefined;
          const pgd = sire?.damId ? animalById.get(sire.damId) : undefined;
          const mgs = dam?.sireId ? animalById.get(dam.sireId) : undefined;
          const mgd = dam?.damId ? animalById.get(dam.damId) : undefined;
          return [
            a.species,
            a.id,
            a.tattoo || a.id,
            a.name,
            sire?.id || a.sireId || '',
            sire?.tattoo || '',
            sire?.name || '',
            dam?.id || a.damId || '',
            dam?.tattoo || '',
            dam?.name || '',
            pgs?.name || pgs?.tattoo || '',
            pgd?.name || pgd?.tattoo || '',
            mgs?.name || mgs?.tattoo || '',
            mgd?.name || mgd?.tattoo || '',
          ];
        });
      const pedigreeLinksCsv = buildCsvDocument(pedigreeHeaders, pedigreeRows);

      const zipBytes = zipSync(
        {
          'animals.csv': strToU8(animalsCsv),
          'breedings.csv': strToU8(breedingsCsv),
          'weights.csv': strToU8(weightsCsv),
          'pedigree_links.csv': strToU8(pedigreeLinksCsv),
        },
        { level: 6 }
      );

      const barnSlug = sanitizeFileSlug(snapshot.settings.barnName, 'pedigree');
      const scopeSlug = scopedSpecies ? `-${sanitizeFileSlug(scopedSpecies, 'species')}` : '';
      const filename = `${barnSlug}${scopeSlug}-herdboss-transfer-${getLocalDateSlug()}.zip`;
      const totalRecords = scopedAnimals.length + scopedBreedings.length + weightLogs.length;

      return {
        exporterId: 'herdboss-transfer-bundle',
        filename,
        mimeType: 'application/zip',
        content: '',
        binaryContent: zipBytes,
        recordCount: totalRecords,
        summary: `Exported HerdBoss 4-table .ZIP bundle (${filename}): ${scopedAnimals.length} animals, ${scopedBreedings.length} breedings, ${weightLogs.length} weight logs, and ${pedigreeRows.length} pedigree link rows.`,
        warnings:
          scopedAnimals.length === 0
            ? ['Archive built cleanly with headers only because zero animals matched the active scope.']
            : [],
      };
    },
  },
  {
    id: 'registry-worksheet-csv',
    name: 'Breed Registry & Show Worksheets',
    formatExtension: '.CSV',
    category: 'external_schema',
    targetPlatform: 'ARBA / ADGA / Custom Registry Forms',
    scopeMode: 'species_required',
    supportsSpeciesFilter: true,
    status: 'ready',
    description:
      'Targeted per-species worksheet columns tailored for registration applications, show entry secretaries, and 3-generation ancestor transfers.',
    compatibilityNote:
      'Exports RFC-4180 UTF-8 BOM CSV scoped to one livestock species with ear tattoo, Reg #, GC #, Legs, 3-gen ancestor Reg #s, and breeder contact.',
    schemaFields: ['Reg #', 'Ear Tattoo', '3-Gen Ancestor Reg #s', 'Legs / GC', 'Breeder Contact'],
    exportPayload(context: ExporterExecutionContext): ExportedArtifactPayload {
      const { snapshot, speciesName } = context;
      const targetSpecies =
        speciesName?.trim() ||
        snapshot.settings.defaultSpecies ||
        snapshot.speciesProfiles[0]?.name ||
        'Rabbit';

      const sp = resolveSpeciesProfile(targetSpecies, snapshot.speciesProfiles);
      const unit = resolveSpeciesWeightUnit(sp, snapshot.settings);
      const herdMap = buildSpeciesHerdMap(snapshot.animals, targetSpecies);

      const animalById = new Map<string, Animal>();
      for (const a of snapshot.animals) {
        if (a.id) animalById.set(a.id, a);
      }

      const scopedAnimals = snapshot.animals
        .filter((a) => isSameSpecies(a.species, targetSpecies))
        .slice()
        .sort((a, b) => {
          const archDiff = (isAnimalArchived(a) ? 1 : 0) - (isAnimalArchived(b) ? 1 : 0);
          if (archDiff !== 0) return archDiff;
          return a.name.localeCompare(b.name) || a.tattoo.localeCompare(b.tattoo);
        });

      const formatAncestorSummary = (anc: Animal | undefined): string => {
        if (!anc) return '';
        const parts: string[] = [];
        if (anc.name) parts.push(anc.name);
        if (anc.tattoo) parts.push(`Ear: ${anc.tattoo}`);
        if (anc.registrationNumber) parts.push(`Reg: ${anc.registrationNumber}`);
        return parts.join(' | ');
      };

      const headers = [
        'Species',
        'Ear_Tattoo',
        'Name',
        'Breed',
        'Variety',
        'Sex',
        'Birth_Date',
        'Weight',
        'Registration_No',
        'Grand_Champion_No',
        'Legs_Earned',
        'Sire_Name',
        'Sire_Tattoo',
        'Sire_Reg_No',
        'Dam_Name',
        'Dam_Tattoo',
        'Dam_Reg_No',
        'Gen3_Pat_Grandsire',
        'Gen3_Pat_Granddam',
        'Gen3_Mat_Grandsire',
        'Gen3_Mat_Granddam',
        'Genotype',
        'Carrier_Disclosures',
        'Breeder_Contact',
        'Owner_Name',
        'Status',
      ];

      const rows = scopedAnimals.map((a) => {
        const sire = a.sireId ? animalById.get(a.sireId) : undefined;
        const dam = a.damId ? animalById.get(a.damId) : undefined;
        const pgs = sire?.sireId ? animalById.get(sire.sireId) : undefined;
        const pgd = sire?.damId ? animalById.get(sire.damId) : undefined;
        const mgs = dam?.sireId ? animalById.get(dam.sireId) : undefined;
        const mgd = dam?.damId ? animalById.get(dam.damId) : undefined;

        const carriers = getAnimalCarrierDisclosures(a);
        const lineage = analyzeAnimalCarrierLineage(a, herdMap);
        const carrierNotes = [
          ...carriers.confirmed.map((t) => `Confirmed: ${t}`),
          ...carriers.suspected.map((t) => `Suspected: ${t}`),
          ...carriers.cleared.map((c) => `Cleared: ${c.trait} (${formatClearedProofBadge(c)})`),
          ...lineage.lineagePotential.map(
            (l) => `Lineage Potential: ${l.trait} (${l.viaBranches.join('/')})`
          ),
        ].join('; ');

        const breederContact = [
          a.breederName || snapshot.settings.breederName || '',
          snapshot.settings.barnName || '',
        ]
          .filter(Boolean)
          .join(' — ');

        return [
          a.species,
          a.tattoo,
          a.name,
          a.breed,
          a.variety,
          formatSexForSpecies(a.sex, sp),
          a.birthDateIso,
          formatWeight(a.weightGrams, unit),
          a.registrationNumber,
          a.grandChampionNumber,
          a.legsCount,
          sire?.name || '',
          sire?.tattoo || '',
          sire?.registrationNumber || '',
          dam?.name || '',
          dam?.tattoo || '',
          dam?.registrationNumber || '',
          formatAncestorSummary(pgs),
          formatAncestorSummary(pgd),
          formatAncestorSummary(mgs),
          formatAncestorSummary(mgd),
          a.genotypeRaw || formatGenotypeArray(a.genotype),
          carrierNotes,
          breederContact,
          a.ownerName,
          a.status,
        ];
      });

      const content = buildCsvDocument(headers, rows);
      const barnSlug = sanitizeFileSlug(snapshot.settings.barnName, 'pedigree');
      const spSlug = sanitizeFileSlug(targetSpecies, 'species');
      const filename = `${barnSlug}-${spSlug}-registry-worksheet-${getLocalDateSlug()}.csv`;

      return {
        exporterId: 'registry-worksheet-csv',
        filename,
        mimeType: 'text/csv;charset=utf-8',
        content,
        recordCount: scopedAnimals.length,
        summary: `Exported ${scopedAnimals.length} ${targetSpecies} registration/show worksheet row(s) to ${filename}.`,
        warnings:
          scopedAnimals.length === 0
            ? [`Zero ${targetSpecies} records found — exported header template only.`]
            : [],
      };
    },
  },
];

export const PLANNED_EXTERNAL_SCHEMA_TARGETS: readonly ExternalExporterDescriptor[] = [];

export function buildExporterCatalog(
  additionalExporters: readonly ExternalExporterDescriptor[] = []
): ExternalExporterDescriptor[] {
  return buildGenericExporterCatalog(
    BUILTIN_NON_NATIVE_EXPORTERS,
    additionalExporters,
    PLANNED_EXTERNAL_SCHEMA_TARGETS
  );
}

export const EXTERNAL_EXPORTERS: readonly ExternalExporterDescriptor[] = buildExporterCatalog();

const DEFAULT_EXPORTER_REGISTRY = createGenericExporterRegistry<
  ExporterExecutionContext,
  ExternalExporterDescriptor
>(EXTERNAL_EXPORTERS);

export function getExternalExporterById(
  id: string,
  catalog: readonly ExternalExporterDescriptor[] = EXTERNAL_EXPORTERS
): ExternalExporterDescriptor | undefined {
  if (catalog === EXTERNAL_EXPORTERS) {
    return DEFAULT_EXPORTER_REGISTRY.getById(id);
  }
  return createGenericExporterRegistry<ExporterExecutionContext, ExternalExporterDescriptor>(
    catalog
  ).getById(id);
}

export function runExternalExporter(
  id: string,
  context: ExporterExecutionContext,
  catalog: readonly ExternalExporterDescriptor[] = EXTERNAL_EXPORTERS
): ExportedArtifactPayload {
  if (catalog === EXTERNAL_EXPORTERS) {
    return DEFAULT_EXPORTER_REGISTRY.run(id, context);
  }
  return createGenericExporterRegistry<ExporterExecutionContext, ExternalExporterDescriptor>(
    catalog
  ).run(id, context);
}
