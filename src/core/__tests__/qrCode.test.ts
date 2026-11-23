import { describe, expect, it } from 'vitest';
import {
  buildAnimalProfileDeepLink,
  buildCageBoardDeepLink,
  computeReedSolomonRemainder,
  encodeQrMatrix,
  normalizeAppBaseUrl,
  parseAppDeepLinkParams,
  renderQrSvg,
} from '../qrCode';
import {
  exportBarnBackupJson,
  generateThermalCageCardHtml,
  parseBarnBackupJson,
} from '../syncAndExports';
import { CageLocation } from '../models';
import { makeAnimal, makeEmptySnapshot, makeSettings, makeSpeciesProfile } from './testFixtures';

// Independent GF(256) evaluator (primitive poly 0x11D) to verify Reed-Solomon syndromes === 0
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function evalPolyAtRoot(codeword: Uint8Array, rootExp: number): number {
  let acc = 0;
  const alpha = GF_EXP[rootExp % 255];
  for (let i = 0; i < codeword.length; i++) {
    acc = gfMul(acc, alpha) ^ codeword[i];
  }
  return acc;
}

describe('qrCode — ISO/IEC 18004 pure TS QR encoder, SVG renderer & deep links', () => {
  it('produces mathematically valid Reed-Solomon codewords with zero syndromes at every generator root', () => {
    const data = new Uint8Array([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
    const ecCount = 10;
    const ec = computeReedSolomonRemainder(data, ecCount);
    expect(ec.length).toBe(ecCount);

    const fullCodeword = new Uint8Array(data.length + ec.length);
    fullCodeword.set(data, 0);
    fullCodeword.set(ec, data.length);

    for (let root = 0; root < ecCount; root++) {
      expect(evalPolyAtRoot(fullCodeword, root)).toBe(0);
    }
  });

  it('encodes short, medium, and long deep-link URLs with valid finder, timing, and dark-module geometry', () => {
    const payloads = [
      'https://barn.app/',
      'https://askkim.org/pedigree/?route=herd&species=Rabbit&animalId=animal-12345678-abcd-ef01',
      `https://askkim.org/pedigree/?route=herd&species=Holland%20Lop%20Rabbit&animalId=${'a'.repeat(160)}`,
      `https://askkim.org/pedigree/?payload=${'z'.repeat(380)}`,
    ];

    for (const payload of payloads) {
      const qr = encodeQrMatrix(payload);
      expect(qr.version).toBeGreaterThanOrEqual(1);
      expect(qr.version).toBeLessThanOrEqual(14);
      expect(qr.size).toBe(17 + qr.version * 4);
      expect(qr.modules.length).toBe(qr.size);
      expect(qr.modules[0].length).toBe(qr.size);

      const at = (r: number, c: number) => qr.modules[r][c];

      // Top-left, top-right, and bottom-left 7x7 finder outer border + 3x3 center
      const finderOrigins: Array<[number, number]> = [
        [0, 0],
        [0, qr.size - 7],
        [qr.size - 7, 0],
      ];
      for (const [r0, c0] of finderOrigins) {
        expect(at(r0, c0)).toBe(true);
        expect(at(r0 + 3, c0 + 3)).toBe(true);
        expect(at(r0 + 1, c0 + 1)).toBe(false);
        expect(at(r0 + 6, c0 + 6)).toBe(true);
      }

      // Alternating timing patterns on row 6 and col 6
      for (let i = 8; i < qr.size - 8; i++) {
        expect(at(6, i)).toBe(i % 2 === 0);
        expect(at(i, 6)).toBe(i % 2 === 0);
      }

      // Mandatory dark module at (size - 8, 8)
      expect(at(qr.size - 8, 8)).toBe(true);
    }

    // Long payload (> 360 bytes) cleanly upgrades to V12–V14 EC-L fallback without throwing
    const huge = encodeQrMatrix(`https://askkim.org/pedigree/?x=${'k'.repeat(400)}`);
    expect(huge.version).toBeGreaterThanOrEqual(11);
    expect(huge.ecLevel).toBe('L');
  });

  it('renders crisp single-path SVG with quiet zone and escaped aria-label', () => {
    const svg = renderQrSvg('https://askkim.org/?route=herd&animalId=abc', {
      sizePx: 96,
      quietZone: 4,
      ariaLabel: 'QR for <"Clover">',
    });
    expect(svg).toContain('<svg ');
    expect(svg).toContain('width="96" height="96"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('aria-label="QR for &lt;&quot;Clover&quot;&gt;"');
    expect(svg).not.toContain('<"Clover">');
  });

  it('builds and parses animal profile and cage board deep links cleanly', () => {
    expect(normalizeAppBaseUrl('https://askkim.org/pedigree/?old=1#hash')).toBe(
      'https://askkim.org/pedigree/'
    );

    const animalLink = buildAnimalProfileDeepLink(
      'https://askkim.org/pedigree/',
      { id: 'an-42', species: 'Rabbit' }
    );
    expect(animalLink).toBe(
      'https://askkim.org/pedigree/?route=herd&species=Rabbit&animalId=an-42'
    );

    const parsedAnimal = parseAppDeepLinkParams(animalLink.slice(animalLink.indexOf('?')));
    expect(parsedAnimal).toEqual({
      route: 'herd',
      species: 'Rabbit',
      animalId: 'an-42',
      cageId: '',
      taskId: '',
      emergencyReset: false,
      hasDeepLink: true,
    });

    const cageLink = buildCageBoardDeepLink(
      'https://askkim.org/pedigree/',
      { id: 'cage-7', species: 'Goat' }
    );
    const parsedCage = parseAppDeepLinkParams(cageLink.slice(cageLink.indexOf('?')));
    expect(parsedCage.route).toBe('dashboard');
    expect(parsedCage.species).toBe('Goat');
    expect(parsedCage.cageId).toBe('cage-7');
    expect(parsedCage.hasDeepLink).toBe(true);
  });

  it('embeds scannable QR vector SVG in thermal cage cards and allows disabling QR', () => {
    const sp = makeSpeciesProfile('Rabbit');
    const settings = makeSettings({ barnName: 'Oak Ridge' });
    const sire = makeAnimal('s1', { name: 'Buck Alpha', tattoo: 'BA1', sex: 'Male' });
    const dam = makeAnimal('d1', { name: 'Doe Beta', tattoo: 'DB1', sex: 'Female' });
    const subject = makeAnimal('a1', {
      name: 'Clover',
      tattoo: 'CL1',
      sex: 'Female',
      sireId: 's1',
      damId: 'd1',
      cageLocation: 'Hutch A-03',
    });
    const allAnimals = [sire, dam, subject];

    const htmlWithQr = generateThermalCageCardHtml(subject, allAnimals, [sp], settings, {
      includeQrCode: true,
      appBaseUrl: 'https://askkim.org/pedigree/',
    });
    expect(htmlWithQr).toContain('class="qr-box"');
    expect(htmlWithQr).toContain('<svg ');
    expect(htmlWithQr).toContain('animalId=a1');

    const htmlWithoutQr = generateThermalCageCardHtml(subject, allAnimals, [sp], settings, {
      includeQrCode: false,
      appBaseUrl: 'https://askkim.org/pedigree/',
    });
    expect(htmlWithoutQr).not.toContain('class="qr-box"');
    expect(htmlWithoutQr).not.toContain('<svg ');
  });

  it('preserves extended CageLocation housing, feedlot, and maintenance fields across JSON backup round-trips', () => {
    const cage: CageLocation = {
      id: 'cage-r1',
      species: 'Rabbit',
      label: 'Hutch R-01',
      section: 'Row A',
      capacity: 2,
      notes: 'Shaded east wall',
      unitType: 'hutch',
      feedLotName: '16% Pellet Bin',
      feedStockRemaining: 42.5,
      feedStockUnit: 'lbs',
      dailyRationNote: '4 oz / head',
      feedLowThreshold: 15,
      maintenanceIntervalDays: 7,
      maintenanceTaskLabel: 'Sanitize tray & refresh bedding',
      lastMaintenanceDateIso: '2026-11-15',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
    };
    const snap = makeEmptySnapshot({ cages: [cage] });
    const exported = exportBarnBackupJson(snap);
    const parsed = parseBarnBackupJson(exported, makeSettings());
    expect(parsed.cages).toHaveLength(1);
    const restored = parsed.cages[0];
    expect(restored.unitType).toBe('hutch');
    expect(restored.feedLotName).toBe('16% Pellet Bin');
    expect(restored.feedStockRemaining).toBe(42.5);
    expect(restored.feedStockUnit).toBe('lbs');
    expect(restored.dailyRationNote).toBe('4 oz / head');
    expect(restored.feedLowThreshold).toBe(15);
    expect(restored.maintenanceIntervalDays).toBe(7);
    expect(restored.maintenanceTaskLabel).toBe('Sanitize tray & refresh bedding');
    expect(restored.lastMaintenanceDateIso).toBe('2026-11-15');
  });
});
