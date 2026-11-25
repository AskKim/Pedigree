/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { buildPedigreePdfBytes } from '../pdfExporter';
import { extractPedigreePdfPages } from '../importers/pdfScanExtractor';
import {
  buildPlatformImportPreviewFromOcrDrafts,
  OcrWordBox,
  parsePedigreeOcrResult,
  parsePedigreeSlotLines,
} from '../importers/pedigreeOcrParser';
import { makeAnimal, makeEmptySnapshot, makeSpeciesProfile } from './testFixtures';

function makeWordRow(
  text: string,
  x0: number,
  y0: number,
  charW = 7,
  h = 12,
  conf = 92
): OcrWordBox[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  let cursorX = x0;
  return tokens.map((tok) => {
    const w = tok.length * charW;
    const box: OcrWordBox = {
      text: tok,
      x0: cursorX,
      y0,
      x1: cursorX + w,
      y1: y0 + h,
      confidence: conf,
    };
    cursorX += w + charW;
    return box;
  });
}

describe('pedigreeOcrParser & pdfScanExtractor', () => {
  it('extracts name, parenthetical tattoo, ARBA reg #, GC #, legs, compound weight, DOB, variety & genotype', () => {
    const parsed = parsePedigreeSlotLines(
      [
        'Oakridge Barnaby (OR-101)',
        'Ear: OR-101 · Reg: 4412A · GC: GC-88 · Legs: 4',
        'Wt: 4# 8oz · Born: 03/14/2024',
        'Breed: Holland Lop · Var: Broken Tort · Geno: aa B_ C_ Dd E_ Enen',
      ],
      'Male',
      'lbs_oz'
    );

    expect(parsed.isUnknown).toBe(false);
    expect(parsed.name).toBe('Oakridge Barnaby');
    expect(parsed.tattoo).toBe('OR-101');
    expect(parsed.registrationNumber).toBe('4412A');
    expect(parsed.grandChampionNumber).toBe('GC-88');
    expect(parsed.legsCount).toBe(4);
    expect(parsed.weightGrams).toBeGreaterThan(2030);
    expect(parsed.weightGrams).toBeLessThan(2050);
    expect(parsed.birthDateIso).toBe('2024-03-14');
    expect(parsed.breed).toBe('Holland Lop');
    expect(parsed.variety).toBe('Broken Tort');
    expect(parsed.genotypeRaw).toBe('aa B_ C_ Dd E_ Enen');
    expect(parsed.sex).toBe('Male');
  });

  it('parses 2D bounding-box 4-column pedigree trees into Subject + Gen 1..3 slots', () => {
    const words: OcrWordBox[] = [
      // Col 0: Subject
      ...makeWordRow('Oakridge Clover (OC-7)', 40, 360),
      ...makeWordRow('Reg: 5510B · Wt: 4# 4oz', 40, 380),
      // Col 1: Gen 1 Sire & Dam
      ...makeWordRow('Briarwood Titan', 280, 180),
      ...makeWordRow('Ear: BW-11 · Reg: 3100X', 280, 198),
      ...makeWordRow('Briarwood Daisy', 280, 560),
      ...makeWordRow('Ear: BW-12 · Wt: 4 lbs 2 oz', 280, 578),
      // Col 2: Gen 2 Grandparents (4 buckets across 80..720)
      ...makeWordRow('Hilltop Rex', 520, 95),
      ...makeWordRow('Hilltop Rose', 520, 275),
      ...makeWordRow('Cedar Buck', 520, 455),
      ...makeWordRow('Cedar Belle', 520, 645),
      // Col 3: Gen 3 Great-Grandparents (top and bottom anchors)
      ...makeWordRow('Founder King (FK-1)', 770, 55),
      ...makeWordRow('Founder Queen (FQ-8)', 770, 695),
    ];

    const res = parsePedigreeOcrResult({
      sourceFileName: 'arba-pedigree-card.jpg',
      rawText: 'Oakridge Clover\nBriarwood Titan\nBriarwood Daisy',
      imageWidth: 1000,
      imageHeight: 760,
      words,
      confidence: 91,
    });

    expect(res.layoutMode).toBe('bounding_box_tree');
    expect(res.detectedSpecies).toBe('Rabbit');
    expect(res.populatedSlotCount).toBeGreaterThanOrEqual(9);

    const byKey = new Map(res.slots.map((s) => [s.slotKey, s]));
    expect(byKey.get('subject')?.name).toBe('Oakridge Clover');
    expect(byKey.get('subject')?.tattoo).toBe('OC-7');
    expect(byKey.get('subject')?.registrationNumber).toBe('5510B');
    expect(byKey.get('sire')?.name).toBe('Briarwood Titan');
    expect(byKey.get('sire')?.tattoo).toBe('BW-11');
    expect(byKey.get('dam')?.name).toBe('Briarwood Daisy');
    expect(byKey.get('dam')?.tattoo).toBe('BW-12');
    expect(byKey.get('pgs')?.name).toBe('Hilltop Rex');
    expect(byKey.get('pgd')?.name).toBe('Hilltop Rose');
    expect(byKey.get('mgs')?.name).toBe('Cedar Buck');
    expect(byKey.get('mgd')?.name).toBe('Cedar Belle');
    expect(byKey.get('sss')?.name).toBe('Founder King');
    expect(byKey.get('ddd')?.name).toBe('Founder Queen');
  });

  it('parses labeled text-line pedigree transcripts and returns clean manual_empty when blank', () => {
    const res = parsePedigreeOcrResult({
      sourceFileName: 'goat-pedigree.png',
      rawText: [
        'Subject: Willow Creek Apollo',
        'Ear: WCA-04 · Breed: Nigerian Dwarf · Color: Buckskin',
        'Sire: Blue Ridge Orion',
        'Reg: ADGA-9981 · Wt: 75 lbs',
        'Dam: Willow Creek Juniper',
        'Ear: WCA-01 · Legs: 2',
        'PGS: Pinehollow Atlas',
        'MGD: Meadow Star',
      ].join('\n'),
      confidence: 84,
    });

    expect(res.layoutMode).toBe('line_heuristic');
    expect(res.detectedSpecies).toBe('Goat');
    const byKey = new Map(res.slots.map((s) => [s.slotKey, s]));
    expect(byKey.get('subject')?.name).toBe('Willow Creek Apollo');
    expect(byKey.get('subject')?.breed).toBe('Nigerian Dwarf');
    expect(byKey.get('sire')?.registrationNumber).toBe('ADGA-9981');
    expect(byKey.get('dam')?.legsCount).toBe(2);
    expect(byKey.get('pgs')?.name).toBe('Pinehollow Atlas');
    expect(byKey.get('mgd')?.name).toBe('Meadow Star');

    const emptyRes = parsePedigreeOcrResult({
      sourceFileName: 'blank.jpg',
      rawText: '',
    });
    expect(emptyRes.layoutMode).toBe('manual_empty');
    expect(emptyRes.populatedSlotCount).toBe(0);
    expect(emptyRes.slots).toHaveLength(15);
  });

  it('round-trips a searchable PDF generated by buildPedigreePdfBytes through extractPedigreePdfPages & OCR parser', () => {
    const sp = makeSpeciesProfile('Rabbit');
    const pgs = makeAnimal('pgs-1', {
      name: 'Sunset Rex',
      tattoo: 'SR-01',
      sex: 'Male',
      breed: 'Holland Lop',
      variety: 'Tort',
    });
    const pgd = makeAnimal('pgd-1', {
      name: 'Sunset Belle',
      tattoo: 'SB-02',
      sex: 'Female',
      breed: 'Holland Lop',
      variety: 'Black',
    });
    const sire = makeAnimal('sire-1', {
      name: 'Oakridge Storm',
      tattoo: 'OS-10',
      sex: 'Male',
      breed: 'Holland Lop',
      variety: 'Blue Tort',
      registrationNumber: 'ARBA-7712',
      sireId: pgs.id,
      damId: pgd.id,
    });
    const dam = makeAnimal('dam-1', {
      name: 'Oakridge Blossom',
      tattoo: 'OB-20',
      sex: 'Female',
      breed: 'Holland Lop',
      variety: 'Broken Tort',
    });
    const subject = makeAnimal('sub-1', {
      name: 'Oakridge Clover',
      tattoo: 'OC-99',
      sex: 'Female',
      breed: 'Holland Lop',
      variety: 'Broken Tort',
      registrationNumber: 'ARBA-8821',
      sireId: sire.id,
      damId: dam.id,
    });

    const snap = makeEmptySnapshot({
      speciesProfiles: [sp],
      animals: [subject, sire, dam, pgs, pgd],
    });

    const pdfBytes = buildPedigreePdfBytes({
      subject,
      allAnimals: snap.animals,
      speciesProfiles: snap.speciesProfiles,
      settings: snap.settings,
      generations: 3,
    });

    const extracted = extractPedigreePdfPages(pdfBytes);
    expect(extracted.ok).toBe(true);
    expect(extracted.isEncrypted).toBe(false);
    expect(extracted.pages.length).toBeGreaterThanOrEqual(1);
    expect(extracted.pages[0].kind).toBe('vector_text');
    expect(extracted.pages[0].rawText).toContain('Oakridge Clover');
    expect(extracted.pages[0].rawText).toContain('Oakridge Storm');
    expect(extracted.pages[0].rawText).toContain('Oakridge Blossom');

    const ocrWords: OcrWordBox[] = (extracted.pages[0].words ?? []).map((w) => ({
      ...w,
      confidence: 98,
    }));
    const parsed = parsePedigreeOcrResult({
      sourceFileName: 'exported-pedigree.pdf',
      rawText: extracted.pages[0].rawText || '',
      imageWidth: extracted.pages[0].width,
      imageHeight: extracted.pages[0].height,
      words: ocrWords,
      confidence: 98,
    });

    expect(parsed.populatedSlotCount).toBeGreaterThanOrEqual(4);
    const byKey = new Map(parsed.slots.map((s) => [s.slotKey, s]));
    expect(byKey.get('subject')?.name).toContain('Oakridge Clover');
    expect(byKey.get('sire')?.name).toContain('Oakridge Storm');
    expect(byKey.get('dam')?.name).toContain('Oakridge Blossom');
  });

  it('extracts embedded /DCTDecode scanned JPEG pages and rejects encrypted PDFs cleanly', () => {
    const fakeJpeg = new Uint8Array(1400);
    fakeJpeg[0] = 0xff;
    fakeJpeg[1] = 0xd8;
    fakeJpeg[1398] = 0xff;
    fakeJpeg[1399] = 0xd9;

    const head = new TextEncoder().encode(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n2 0 obj\n<< /Type /XObject /Subtype /Image /Width 1200 /Height 900 /Filter /DCTDecode /Length 1400 >>\nstream\n'
    );
    const tail = new TextEncoder().encode('\nendstream\nendobj\n%%EOF\n');
    const scanPdf = new Uint8Array(head.length + fakeJpeg.length + tail.length);
    scanPdf.set(head, 0);
    scanPdf.set(fakeJpeg, head.length);
    scanPdf.set(tail, head.length + fakeJpeg.length);

    const scanRes = extractPedigreePdfPages(scanPdf);
    expect(scanRes.ok).toBe(true);
    expect(scanRes.pages).toHaveLength(1);
    expect(scanRes.pages[0].kind).toBe('raster_jpeg');
    expect(scanRes.pages[0].jpegBytes?.[0]).toBe(0xff);
    expect(scanRes.pages[0].jpegBytes?.[1]).toBe(0xd8);
    expect(scanRes.pages[0].jpegBytes?.slice(-2)).toEqual(new Uint8Array([0xff, 0xd9]));

    const encryptedPdf = new TextEncoder().encode(
      '%PDF-1.6\n1 0 obj\n<< /Filter /Standard /Encrypt 2 0 R >>\nendobj\n%%EOF'
    );
    const encRes = extractPedigreePdfPages(encryptedPdf);
    expect(encRes.ok).toBe(false);
    expect(encRes.isEncrypted).toBe(true);
    expect(encRes.errorMessage).toContain('password-protected');
  });

  it('builds PlatformImportPreview with 3-gen parent links, Subject scan photo attachment & preexisting conflict detection', () => {
    const existingSubject = makeAnimal('existing-oc-7', {
      tattoo: 'OC-7',
      name: 'Oakridge Clover',
      breed: 'Holland Lop',
      variety: 'Tort',
      weightGrams: 1850,
    });
    const snapshot = makeEmptySnapshot({
      animals: [existingSubject],
    });

    const parsed = parsePedigreeOcrResult({
      sourceFileName: 'clover-card.jpg',
      rawText: [
        'Subject: Oakridge Clover',
        'Ear: OC-7 · Breed: Holland Lop · Var: Broken Tort · Wt: 4# 8oz',
        'Sire: Briarwood Titan',
        'Ear: BW-11',
        'Dam: Briarwood Daisy',
        'Ear: BW-12',
      ].join('\n'),
    });

    const fakeScanBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const preview = buildPlatformImportPreviewFromOcrDrafts({
      slots: parsed.slots,
      speciesName: 'Rabbit',
      sourceFileName: 'clover-card.jpg',
      existingSnapshot: snapshot,
      attachedScanPhoto: {
        fileName: 'clover-card.jpg',
        mimeHint: 'image/jpeg',
        bytes: fakeScanBytes,
      },
    });

    expect(preview.animals).toHaveLength(3);
    expect(preview.parentLinksResolved).toBe(2);
    expect(preview.matchedExistingAnimalsCount).toBe(1);
    expect(preview.conflicts.length).toBe(1);
    expect(preview.conflicts[0].animalId).toBe(existingSubject.id);

    const subj = preview.animals.find((a) => a.id === existingSubject.id)!;
    const sire = preview.animals.find((a) => a.name === 'Briarwood Titan')!;
    const dam = preview.animals.find((a) => a.name === 'Briarwood Daisy')!;
    expect(subj.sireId).toBe(sire.id);
    expect(subj.damId).toBe(dam.id);

    expect(preview.stagedPhotos).toHaveLength(1);
    expect(preview.stagedPhotos[0].animalId).toBe(existingSubject.id);
    expect(preview.stagedPhotos[0].species).toBe('Rabbit');
  });
});
