/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Pure Content-Agnostic Exporter & Importer Registry Contracts
 * (`@engine/primitives/genericRegistries.ts`).
 *
 * Zero DOM, zero Node built-ins, zero domain terminology.
 */

export type GenericExporterReadinessStatus = 'ready' | 'planned';

export interface GenericExportedArtifact {
  exporterId: string;
  filename: string;
  mimeType: string;
  content: string;
  binaryContent?: Uint8Array;
  recordCount: number;
  summary: string;
  warnings: string[];
}

export interface GenericExporterDescriptor<
  TContext,
  TCategory extends string = string,
  TScopeMode extends string = string,
> {
  readonly id: string;
  readonly name: string;
  readonly formatExtension: string;
  readonly category: TCategory;
  readonly targetPlatform: string;
  readonly scopeMode: TScopeMode;
  readonly description: string;
  readonly compatibilityNote: string;
  readonly status: GenericExporterReadinessStatus;
  readonly schemaFields?: readonly string[];
  exportPayload?: (context: TContext) => GenericExportedArtifact;
}

export interface GenericExporterRegistry<
  TDescriptor extends GenericExporterDescriptor<TContext, string, string>,
  TContext,
> {
  readonly catalog: readonly TDescriptor[];
  getById(id: string): TDescriptor | undefined;
  run(id: string, context: TContext): GenericExportedArtifact;
}

export function buildGenericExporterCatalog<
  TDescriptor extends { readonly id: string },
>(
  builtinExporters: readonly TDescriptor[],
  additionalExporters: readonly TDescriptor[] = [],
  plannedExporters: readonly TDescriptor[] = []
): TDescriptor[] {
  const byId = new Map<string, TDescriptor>();
  for (const exp of builtinExporters) {
    byId.set(exp.id, exp);
  }
  for (const exp of additionalExporters) {
    byId.set(exp.id, exp);
  }
  for (const exp of plannedExporters) {
    if (!byId.has(exp.id)) {
      byId.set(exp.id, exp);
    }
  }
  return Array.from(byId.values());
}

export function createGenericExporterRegistry<
  TContext,
  TDescriptor extends GenericExporterDescriptor<TContext, string, string>,
>(
  builtinExporters: readonly TDescriptor[],
  additionalExporters: readonly TDescriptor[] = [],
  plannedExporters: readonly TDescriptor[] = []
): GenericExporterRegistry<TDescriptor, TContext> {
  const catalog = buildGenericExporterCatalog(
    builtinExporters,
    additionalExporters,
    plannedExporters
  );

  const getById = (id: string): TDescriptor | undefined => catalog.find((exp) => exp.id === id);

  const run = (id: string, context: TContext): GenericExportedArtifact => {
    const exporter = getById(id);
    if (!exporter) {
      throw new Error(`Unknown exporter "${id}".`);
    }
    if (exporter.status !== 'ready' || typeof exporter.exportPayload !== 'function') {
      throw new Error(
        `Exporter "${exporter.name}" is registered as a planned external schema target and is not yet active.`
      );
    }
    return exporter.exportPayload(context);
  };

  return {
    catalog,
    getById,
    run,
  };
}

export interface RawArchiveInput {
  fileName: string;
  bytes: Uint8Array;
}

export interface VirtualArchiveEntry {
  archiveName: string;
  entryPath: string;
  baseName: string;
  extension: string;
  sizeBytes: number;
  textContent?: string;
  imageBytes?: Uint8Array;
  mimeHint?: string;
  isMediaOrBinary: boolean;
}

export interface GenericPlatformImporter<
  TSnapshot,
  TOptions,
  TPreview,
  TInput = RawArchiveInput,
> {
  readonly id: string;
  readonly name: string;
  readonly badge: string;
  readonly supportsMultiZip: boolean;
  readonly acceptedExtensions: string[];
  readonly summary: string;
  readonly instructions: string;
  parse(inputs: TInput[], existingSnapshot: TSnapshot, options: TOptions): TPreview;
}

export interface GenericImporterRegistry<TImporter extends { readonly id: string }> {
  readonly importers: readonly TImporter[];
  getById(id: string): TImporter;
}

export function createGenericImporterRegistry<TImporter extends { readonly id: string }>(
  importers: readonly TImporter[]
): GenericImporterRegistry<TImporter> {
  if (importers.length === 0) {
    throw new Error('Importer registry requires at least one importer descriptor.');
  }
  const list = [...importers];
  return {
    importers: list,
    getById(id: string): TImporter {
      return list.find((imp) => imp.id === id) || list[0];
    },
  };
}
