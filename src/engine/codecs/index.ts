/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Modular Core — Pure Codecs Barrel (`@engine/codecs`).
 *
 * Strictly depends only on `@engine/binaryEncoding`, `@engine/primitives/*`, and `fflate`.
 * Zero DOM globals, zero domain terms, zero feature/app imports.
 */

export * from '../binaryEncoding';
export * from '../primitives/qrCodec';
export * from '../primitives/pdfDocumentExtractor';
export * from './archiveAndCsvUtils';
export * from './textFormats';
