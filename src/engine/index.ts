/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Modular Engine — Content-Agnostic Engine Entry Surface (`@engine`).
 *
 * Exposes strictly domain-free, framework-extractable modules (`primitives`, `codecs`,
 * `bridge`, `storage`, `sync`) with zero application-domain references and zero
 * React/app/feature dependencies.
 */

export * from './binaryEncoding';
export * from './primitives';
export * from './bridge';
export * from './storage';
export * from './codecs/archiveAndCsvUtils';
