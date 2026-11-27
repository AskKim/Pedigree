/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Domain PDF Export Actions (`@app/pedigreePdfActions.ts`).
 *
 * Layer 3 wrapper binding pure PDF byte generators (`src/domain/pdfExporter.ts`)
 * to the content-agnostic raster-to-JPEG & binary download helpers (`src/utils/webPdfActions.ts`).
 */

import {
  BlankPedigreePdfExportParams,
  buildBlankPedigreePdfBytes,
  buildPedigreePdfBytes,
  PedigreePdfExportParams,
} from '../domain/pdfExporter';
import { buildAndDownloadPdfDocument, rasterDataUrlToPdfJpeg } from '../utils/webPdfActions';

export async function buildAndDownloadPedigreePdf(
  params: Omit<PedigreePdfExportParams, 'subjectPhotoJpeg' | 'breederLogoJpeg'> & {
    pdfFilename: string;
    primaryPhotoDataUrl?: string;
  }
): Promise<void> {
  const showLogo = params.printOptions?.showBreederLogo ?? true;
  const rawLogoUrl = showLogo
    ? params.printOptions?.breederLogoDataUrl !== undefined
      ? params.printOptions.breederLogoDataUrl
      : params.settings.breederLogoDataUrl
    : undefined;

  const subjectPhotoJpeg = params.primaryPhotoDataUrl
    ? await rasterDataUrlToPdfJpeg(params.primaryPhotoDataUrl, 420)
    : undefined;
  const breederLogoJpeg = rawLogoUrl
    ? await rasterDataUrlToPdfJpeg(rawLogoUrl, 360)
    : undefined;

  await buildAndDownloadPdfDocument(
    params.pdfFilename,
    {
      subject: params.subject,
      allAnimals: params.allAnimals,
      speciesProfiles: params.speciesProfiles,
      settings: params.settings,
      generations: params.generations,
      printOptions: params.printOptions,
      subjectPhotoJpeg,
      breederLogoJpeg,
    },
    buildPedigreePdfBytes
  );
}

export async function buildAndDownloadBlankPedigreePdf(
  params: Omit<BlankPedigreePdfExportParams, 'breederLogoJpeg'> & {
    pdfFilename: string;
  }
): Promise<void> {
  const includeHeader = params.options?.includeFarmHeader ?? true;
  const showLogo = includeHeader && (params.options?.showBreederLogo ?? true);
  const rawLogoUrl = showLogo
    ? params.options?.breederLogoDataUrl !== undefined
      ? params.options.breederLogoDataUrl
      : params.settings.breederLogoDataUrl
    : undefined;
  const breederLogoJpeg = rawLogoUrl
    ? await rasterDataUrlToPdfJpeg(rawLogoUrl, 360)
    : undefined;

  await buildAndDownloadPdfDocument(
    params.pdfFilename,
    {
      settings: params.settings,
      speciesProfile: params.speciesProfile,
      options: params.options,
      breederLogoJpeg,
    },
    buildBlankPedigreePdfBytes
  );
}
