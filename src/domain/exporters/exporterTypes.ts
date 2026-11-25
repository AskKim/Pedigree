/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Modular Non-Native & External Format Exporter Interfaces (`src/domain/exporters/exporterTypes.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`, `File`, `Blob`) dependencies
 * so the exact same exporter definitions and output serializers run identically in Web/PWA,
 * automated tests, and React Native / Expo.
 */

import type { BarnDatabaseSnapshot, PedigreeGenerationDepth } from '../models';
import type {
  GenericExportedArtifact,
  GenericExporterDescriptor,
  GenericExporterReadinessStatus,
} from '@engine/primitives/genericRegistries';

export type ExporterCategory =
  | 'spreadsheet'
  | 'pedigree_document'
  | 'calendar'
  | 'report_dto'
  | 'external_schema';

export type ExporterScopeMode =
  | 'all_or_species'
  | 'species_required'
  | 'single_animal'
  | 'open_tasks';

export type ExporterReadinessStatus = GenericExporterReadinessStatus;

export interface ExporterExecutionContext {
  snapshot: BarnDatabaseSnapshot;
  /** Optional species filter (`undefined` or empty string means all species when supported). */
  speciesName?: string;
  /** Required when `scopeMode === 'single_animal'`. */
  animalId?: string;
  /** Pedigree chart depth override (3..8). Defaults to `snapshot.settings.defaultGenerations`. */
  generations?: PedigreeGenerationDepth;
  /** Optional toggle for binder/report exporters that filter archived stock. */
  includeArchived?: boolean;
  /** Optional base URL for `.ICS` deep links back into the app. */
  appBaseUrl?: string;
}

export type ExportedArtifactPayload = GenericExportedArtifact;

export interface ExternalExporterDescriptor
  extends GenericExporterDescriptor<
    ExporterExecutionContext,
    ExporterCategory,
    ExporterScopeMode
  > {
  readonly supportsSpeciesFilter: boolean;
}
