/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  formatPedigreeWeight,
  formatWeightArbaLbsOzDot,
} from '../models';
import { buildBlankPedigreePdfBytes, buildPedigreePdfBytes } from '../pdfExporter';
import {
  exportBarnBackupJson,
  generateEvansHtmPedigree,
  parseBarnBackupJson,
} from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

describe('ARBA lbs.oz dot notation, pedigree orientation/logo, and offline PDF export', () => {
  it('formats weights in ARBA lbs.oz dot notation (e.g., 10.04) and handles ounce rollover', () => {
    // 10 lb 4 oz = 164 oz = 4649.32 g
    expect(formatWeightArbaLbsOzDot(Math.round(164 * 28.349523125))).toBe('10.04');
    // 4 lb 12 oz = 76 oz
    expect(formatWeightArbaLbsOzDot(Math.round(76 * 28.349523125))).toBe('4.12');
    // 0 lb 8 oz = 8 oz
    expect(formatWeightArbaLbsOzDot(Math.round(8 * 28.349523125))).toBe('0.08');
    // Rollover edge: 5 lb 15.9 oz -> rounds to 6.00
    expect(formatWeightArbaLbsOzDot(Math.round((5 * 16 + 15.9) * 28.349523125))).toBe('6.00');
    expect(formatWeightArbaLbsOzDot(0)).toBe('Unweighed');

    expect(formatPedigreeWeight(Math.round(164 * 28.349523125), 'lbs_oz', false)).toBe('10 lb 4 oz');
    expect(formatPedigreeWeight(Math.round(164 * 28.349523125), 'kg', true)).toBe('10.04');
  });

  it('supports Landscape/Portrait orientation, breeder logo, and lbs.oz notation in generateEvansHtmPedigree', () => {
    const profiles = [makeSpeciesProfile('Rabbit')];
    const sire = makeAnimal('s1', {
      name: 'Copper King',
      tattoo: 'CK1',
      sex: 'Male',
      weightGrams: Math.round(164 * 28.349523125), // 10.04
    });
    const dam = makeAnimal('d1', {
      name: 'Ruby Queen',
      tattoo: 'RQ2',
      sex: 'Female',
      weightGrams: Math.round(172 * 28.349523125), // 10.12
    });
    const kit = makeAnimal('k1', {
      name: 'Clover',
      tattoo: 'CL9',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
      weightGrams: Math.round(76 * 28.349523125), // 4.12
    });
    const logoUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const settings = makeSettings({ breederLogoDataUrl: logoUrl });

    const portraitHtml = generateEvansHtmPedigree(
      kit,
      [kit, sire, dam],
      profiles,
      settings,
      4,
      undefined,
      {
        orientation: 'portrait',
        showWeights: true,
        arbaLbsOzDotNotation: true,
        showBreederLogo: true,
      }
    );

    expect(portraitHtml).toContain('@page { size: letter portrait;');
    expect(portraitHtml).toContain('max-width: 8.5in;');
    expect(portraitHtml).toContain(`class="barn-logo" src="${logoUrl}"`);
    expect(portraitHtml).toContain('4.12');
    expect(portraitHtml).toContain('10.04');
    expect(portraitHtml).toContain('10.12');

    // Can disable logo & use SVG-rejected safety
    const hiddenLogoHtml = generateEvansHtmPedigree(
      kit,
      [kit, sire, dam],
      profiles,
      settings,
      3,
      undefined,
      {
        orientation: 'landscape',
        showBreederLogo: false,
        breederLogoDataUrl: 'data:image/svg+xml,<svg/>',
      }
    );
    expect(hiddenLogoHtml).toContain('@page { size: letter landscape;');
    expect(hiddenLogoHtml).not.toContain('class="barn-logo"');
  });

  it('builds a valid offline PDF 1.4 binary with exact xref offsets, Portrait/Landscape MediaBox, and JPEG XObjects', () => {
    const profiles = [makeSpeciesProfile('Rabbit')];
    const sire = makeAnimal('s1', {
      name: 'Copper King',
      tattoo: 'CK1',
      sex: 'Male',
      weightGrams: Math.round(164 * 28.349523125),
      registrationNumber: 'ARBA-1234',
    });
    const dam = makeAnimal('d1', {
      name: 'Ruby Queen',
      tattoo: 'RQ2',
      sex: 'Female',
      weightGrams: Math.round(172 * 28.349523125),
    });
    const kit = makeAnimal('k1', {
      name: 'Clover (Special)',
      tattoo: 'CL\\9',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
      weightGrams: Math.round(76 * 28.349523125),
      genotypeRaw: 'A_ B_ C_ D_ ee',
    });
    const settings = makeSettings();
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

    const landscapePdf = buildPedigreePdfBytes({
      subject: kit,
      allAnimals: [kit, sire, dam],
      speciesProfiles: profiles,
      settings,
      generations: 3,
      printOptions: {
        orientation: 'landscape',
        showWeights: true,
        arbaLbsOzDotNotation: true,
        showGenotypes: true,
        showBreederFooter: true,
        breederContactLine: 'https://meadowbrook.example',
        showBreederLogo: true,
      },
      breederLogoJpeg: { bytes: fakeJpeg, width: 120, height: 60 },
      subjectPhotoJpeg: { bytes: fakeJpeg, width: 200, height: 200 },
    });

    const landscapeText = bytesToLatin1(landscapePdf);
    expect(landscapeText.startsWith('%PDF-1.4')).toBe(true);
    expect(landscapeText.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(landscapeText).toContain('/MediaBox [0 0 792 612]');
    expect(landscapeText).toContain('/ImLogo');
    expect(landscapeText).toContain('/ImPhoto');
    expect(landscapeText).toContain('/Filter /DCTDecode');
    expect(landscapeText).toContain('Clover \\(Special\\)');
    expect(landscapeText).toContain('CL\\\\9');
    expect(landscapeText).toContain('4.12');
    expect(landscapeText).toContain('10.04');
    expect(landscapeText).toContain('https://meadowbrook.example');

    // Verify startxref offset points directly to 'xref'
    const startXrefMatch = landscapeText.match(/startxref\n(\d+)\n%%EOF/);
    expect(startXrefMatch).toBeTruthy();
    const xrefPos = Number(startXrefMatch![1]);
    expect(landscapeText.slice(xrefPos, xrefPos + 4)).toBe('xref');

    // Verify every xref object offset points to `<id> 0 obj`
    const xrefBody = landscapeText.slice(xrefPos).split('trailer')[0];
    const entryMatches = Array.from(xrefBody.matchAll(/(\d{10}) 00000 n /g));
    expect(entryMatches.length).toBeGreaterThanOrEqual(7);
    entryMatches.forEach((m, idx) => {
      const objOffset = Number(m[1]);
      expect(landscapeText.slice(objOffset, objOffset + 12)).toMatch(
        new RegExp(`^${idx + 1} 0 obj\\n`)
      );
    });

    // Portrait 6-generation check
    const portraitPdf = buildPedigreePdfBytes({
      subject: kit,
      allAnimals: [kit, sire, dam],
      speciesProfiles: profiles,
      settings,
      generations: 6,
      printOptions: {
        orientation: 'portrait',
        showWeights: false,
        showGenotypes: false,
        showBreederFooter: false,
      },
    });
    const portraitText = bytesToLatin1(portraitPdf);
    expect(portraitText).toContain('/MediaBox [0 0 612 792]');
    expect(portraitText).not.toContain('Breeder Signature:');
  });

  it('round-trips BarnSettings.breederLogoDataUrl safely through JSON backup export & parse', () => {
    const logoUrl = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    const snap = makeEmptySnapshot({
      settings: makeSettings({ breederLogoDataUrl: logoUrl }),
    });
    const json = exportBarnBackupJson(snap);
    const parsed = parseBarnBackupJson(json, makeSettings());
    expect(parsed.settings.breederLogoDataUrl).toBe(logoUrl);

    // Rejects unsafe SVG data URLs during backup parse
    const tampered = JSON.parse(json);
    tampered.settings.breederLogoDataUrl = 'data:image/svg+xml,<svg onload=alert(1)/>';
    const parsedTampered = parseBarnBackupJson(JSON.stringify(tampered), makeSettings());
    expect(parsedTampered.settings.breederLogoDataUrl).toBeUndefined();
  });

  it('builds valid multi-page PDF 1.4 binaries for 7-gen (2 pages) and 8-gen (4 pages) pedigrees with custom print presets', () => {
    const profiles = [makeSpeciesProfile('Rabbit')];
    const settings = makeSettings({ barnName: 'Multi-Sheet Rabbitry' });

    const g8 = makeAnimal('g8-pdf', { sex: 'Male', name: 'G8 Patriarch', tattoo: 'P8' });
    const g7 = makeAnimal('g7-pdf', { sex: 'Male', name: 'G7 Sire', sireId: 'g8-pdf' });
    const g6 = makeAnimal('g6-pdf', { sex: 'Male', name: 'G6 Sire', sireId: 'g7-pdf' });
    const g5 = makeAnimal('g5-pdf', { sex: 'Male', name: 'G5 Sire', sireId: 'g6-pdf' });
    const g4 = makeAnimal('g4-pdf', { sex: 'Male', name: 'G4 Sire', sireId: 'g5-pdf' });
    const g3 = makeAnimal('g3-pdf', { sex: 'Male', name: 'G3 Sire', sireId: 'g4-pdf' });
    const g2 = makeAnimal('g2-pdf', { sex: 'Male', name: 'G2 Grandsire', sireId: 'g3-pdf' });
    const g1 = makeAnimal('g1-pdf', { sex: 'Male', name: 'G1 Sire', sireId: 'g2-pdf' });
    const subject = makeAnimal('subj-pdf8', {
      sex: 'Female',
      name: 'Sheeted Prospect',
      tattoo: 'SP8',
      sireId: 'g1-pdf',
    });
    const allAnimals = [g8, g7, g6, g5, g4, g3, g2, g1, subject];

    const verifyValidPdfXref = (pdfText: string, expectedPages: number) => {
      expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfText.trimEnd().endsWith('%%EOF')).toBe(true);
      expect(pdfText).toContain(`/Count ${expectedPages}`);
      const startXrefMatch = pdfText.match(/startxref\n(\d+)\n%%EOF/);
      expect(startXrefMatch).toBeTruthy();
      const xrefPos = Number(startXrefMatch![1]);
      expect(pdfText.slice(xrefPos, xrefPos + 4)).toBe('xref');
      const xrefBody = pdfText.slice(xrefPos).split('trailer')[0];
      const entryMatches = Array.from(xrefBody.matchAll(/(\d{10}) 00000 n /g));
      entryMatches.forEach((m, idx) => {
        const objOffset = Number(m[1]);
        expect(pdfText.slice(objOffset, objOffset + 12)).toMatch(
          new RegExp(`^${idx + 1} 0 obj\\n`)
        );
      });
    };

    const pdf7 = buildPedigreePdfBytes({
      subject,
      allAnimals,
      speciesProfiles: profiles,
      settings,
      generations: 7,
      printOptions: {
        orientation: 'landscape',
        colorPreset: 'royal_navy',
        borderStyle: 'double_frame',
        layoutPreset: 'show_certificate',
      },
    });
    const pdf7Text = bytesToLatin1(pdf7);
    verifyValidPdfXref(pdf7Text, 2);
    expect(pdf7Text).toContain('Sheet 1 of 2');
    expect(pdf7Text).toContain('Sheet 2 of 2');
    expect(pdf7Text).toContain('Page 1/2');
    expect(pdf7Text).toContain('Page 2/2');

    const pdf8 = buildPedigreePdfBytes({
      subject,
      allAnimals,
      speciesProfiles: profiles,
      settings,
      generations: 8,
      printOptions: {
        orientation: 'landscape',
        colorPreset: 'monochrome_ink',
        borderStyle: 'minimal_lines',
        layoutPreset: 'compact_ledger',
      },
    });
    const pdf8Text = bytesToLatin1(pdf8);
    verifyValidPdfXref(pdf8Text, 4);
    expect(pdf8Text).toContain('Sheet 1 of 4');
    expect(pdf8Text).toContain('Sheet 4 of 4');
    expect(pdf8Text).toContain('G8 Patriarch');
  });

  it('builds a valid offline PDF 1.4 binary for blank write-in pedigree templates', () => {
    const settings = makeSettings({
      barnName: 'Meadowbrook Rabbitry',
      breederName: 'Kim Breeder',
      breederAddress: '100 Barn Ln',
      breederLocation: 'Boise, ID',
      breederZip: '83702',
    });
    const rabbitProfile = makeSpeciesProfile('Rabbit');

    const pdfWithHeader = buildBlankPedigreePdfBytes({
      settings,
      speciesProfile: rabbitProfile,
      options: {
        generations: 5,
        includeFarmHeader: true,
        orientation: 'landscape',
      },
    });
    const textWithHeader = bytesToLatin1(pdfWithHeader);
    expect(textWithHeader.startsWith('%PDF-1.4')).toBe(true);
    expect(textWithHeader.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(textWithHeader).toContain('Meadowbrook Rabbitry');
    expect(textWithHeader).toContain('5th Gen');
    expect(textWithHeader).toContain('100 Barn Ln');

    const pdfWithoutHeader = buildBlankPedigreePdfBytes({
      settings,
      speciesProfile: rabbitProfile,
      options: {
        generations: 3,
        includeFarmHeader: false,
        orientation: 'portrait',
      },
    });
    const textWithoutHeader = bytesToLatin1(pdfWithoutHeader);
    expect(textWithoutHeader.startsWith('%PDF-1.4')).toBe(true);
    expect(textWithoutHeader).toContain('/MediaBox [0 0 612 792]');
    expect(textWithoutHeader).toContain('3-Generation Blank Pedigree Form');
    expect(textWithoutHeader).not.toContain('Meadowbrook Rabbitry');
  });
});

