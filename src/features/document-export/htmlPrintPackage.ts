/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Content-Agnostic Printable HTML Document Packager (`@features/document-export/htmlPrintPackage.ts`).
 *
 * Builds self-contained printable HTML documents and dispatches them cleanly through
 * `IPlatformBridge.printDocument` or `IPlatformBridge.exportBinary`. Zero domain terms,
 * zero cross-feature imports, zero DOM assumptions during document generation.
 */

import { utf8StringToBytes } from '@engine/binaryEncoding';
import type { IPlatformBridge, PlatformExportResult } from '@engine/bridge';
import { escapeSafeHtml, sanitizeSingleLineText } from '@engine/primitives';
import type { IFeatureModule } from '../featureModule.interface';

export type DocumentOrientation = 'portrait' | 'landscape';

export interface PrintableHtmlSpec {
  readonly title: string;
  readonly subtitle?: string;
  readonly orientation?: DocumentOrientation;
  readonly customCss?: string;
  readonly bodyHtml: string;
  readonly footerText?: string;
}

export interface PrintableHtmlPackage {
  readonly title: string;
  readonly orientation: DocumentOrientation;
  readonly htmlContent: string;
  readonly byteLength: number;
}

/**
 * Assembles a self-contained, sanitized HTML document package ready for printing or export.
 *
 * @param spec Title, optional subtitle, body HTML, orientation, custom CSS, and footer
 * @returns Clean PrintableHtmlPackage with title, orientation, HTML string, and byteLength
 */
export function buildPrintableHtmlDocument(spec: PrintableHtmlSpec): PrintableHtmlPackage {
  const safeTitle = sanitizeSingleLineText(spec.title || 'Printable Document', 160);
  const safeSubtitle = spec.subtitle ? sanitizeSingleLineText(spec.subtitle, 240) : '';
  const safeFooter = spec.footerText ? sanitizeSingleLineText(spec.footerText, 240) : '';
  const orientation: DocumentOrientation =
    spec.orientation === 'landscape' ? 'landscape' : 'portrait';

  const htmlContent = [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeSafeHtml(safeTitle)}</title>`,
    '<style>',
    `@page { size: letter ${orientation}; margin: 0.45in; }`,
    '* { box-sizing: border-box; }',
    'html, body { background: #ffffff; color: #111827; font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; font-size: 11pt; }',
    '.doc-shell { padding: 12px; }',
    '.doc-header { border-bottom: 1.5px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 12px; }',
    '.doc-title { font-size: 16pt; font-weight: 700; margin: 0; }',
    '.doc-subtitle { font-size: 10pt; color: #475569; margin: 4px 0 0; }',
    '.doc-footer { border-top: 1px solid #e2e8f0; margin-top: 16px; padding-top: 6px; font-size: 9pt; color: #64748b; }',
    spec.customCss ? spec.customCss : '',
    '</style>',
    '</head>',
    '<body>',
    '<div class="doc-shell">',
    '<header class="doc-header">',
    `<h1 class="doc-title">${escapeSafeHtml(safeTitle)}</h1>`,
    safeSubtitle ? `<p class="doc-subtitle">${escapeSafeHtml(safeSubtitle)}</p>` : '',
    '</header>',
    `<main class="doc-body">${spec.bodyHtml}</main>`,
    safeFooter ? `<footer class="doc-footer">${escapeSafeHtml(safeFooter)}</footer>` : '',
    '</div>',
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    title: safeTitle,
    orientation,
    htmlContent,
    byteLength: utf8StringToBytes(htmlContent).byteLength,
  };
}

/**
 * Forwards a printable document package to the platform bridge for direct system printing.
 *
 * @param bridge Host platform bridge (browser, Android, Apple, or desktop)
 * @param pkg PrintableHtmlPackage to spool
 * @returns Promise resolving true if print request was accepted
 */
export async function dispatchPrintPackage(
  bridge: IPlatformBridge,
  pkg: PrintableHtmlPackage
): Promise<boolean> {
  return bridge.printDocument({
    title: pkg.title,
    orientation: pkg.orientation,
    htmlContent: pkg.htmlContent,
  });
}

/**
 * Dispatches a printable document package as a downloadable or shareable HTML file.
 *
 * @param bridge Host platform bridge
 * @param pkg PrintableHtmlPackage to export
 * @param filename Suggested export filename
 * @param mode 'save' (download to disk) or 'share' (native OS share sheet)
 * @returns PlatformExportResult with status and bytes
 */
export async function dispatchHtmlDownloadPackage(
  bridge: IPlatformBridge,
  pkg: PrintableHtmlPackage,
  filename: string,
  mode: 'save' | 'share' = 'save'
): Promise<PlatformExportResult> {
  const bytes = utf8StringToBytes(pkg.htmlContent);
  return bridge.exportBinary({
    filename,
    mimeType: 'text/html;charset=utf-8',
    mode,
    bytes,
  });
}

export function createDocumentExportFeatureModule(): IFeatureModule<
  { defaultOrientation?: DocumentOrientation },
  { ready: boolean; defaultOrientation: DocumentOrientation }
> {
  let ready = false;
  let defaultOrientation: DocumentOrientation = 'portrait';

  return {
    metadata: {
      id: 'document-export',
      name: 'Printable Document Export',
      version: '1.0.0',
      description: 'Content-agnostic HTML document builder wired to IPlatformBridge printing and export.',
    },
    async initialize(context) {
      if (context.config?.defaultOrientation === 'landscape') {
        defaultOrientation = 'landscape';
      }
      ready = true;
    },
    async dispose() {
      ready = false;
    },
    getStateSnapshot() {
      return { ready, defaultOrientation };
    },
  };
}
