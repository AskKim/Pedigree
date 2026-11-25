/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Application Configuration & Domain Composition Layer (`@app`).
 *
 * Layer 3 Boundary:
 * Binds content-agnostic core engines (@engine/*) to feature modules (@features/*)
 * with domain-specific pedigree rules, UI layouts, and species configuration.
 */

export * from './appConfig.interface';
export * from './animalProfileSchema';
export * from './animalCsvConfig';
export * from './pedigreeAppConfig';
export * from './pedigreeAppWiring';
export * from './pedigreePdfActions';
export * from './pedigreeCalendarClient';
export * from './PlatformBridgeContext';
