/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Reusable Features Layer (`@features`).
 *
 * Boundary Invariant:
 * Every module within this folder must be fully self-contained.
 * Cross-feature imports are strictly forbidden. All inter-feature communication
 * is mediated via `@engine/*` contracts or assembled in `@app/*`.
 */

export * from './featureModule.interface';
export * from './csv-importer';
export * from './csv-exporter';
export * from './backup-vault';
export * from './document-export';
export * from './ics-calendar';
export * from './ocr-parser';
