/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  buildBreederShowcaseFileName,
  buildBreederShowcaseResult,
  generateBreederShowcaseHtml,
} from '../breederShowcase';
import { sanitizeSafeExternalHttpUrl } from '../inputSanitization';
import { isAnimalAvailableForSale } from '../models';
import { exportBarnBackupJson, parseBarnBackupJson } from '../syncAndExports';
import { makeAnimal, makeEmptySnapshot, makeSettings } from './testFixtures';

const VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const VALID_WEBP_THUMB_URL =
  'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';

describe('breederShowcase — Zero-Server Breeder Showcase & For-Sale Catalog Exporter', () => {
  it('filters strictly with isAnimalAvailableForSale (excludes Sold, Deceased, Archived, and Reference stock)', () => {
    const sire = makeAnimal('sire-1', {
      name: 'Oak Ridge Monarch',
      tattoo: 'ORM1',
      sex: 'Male',
      variety: 'Chestnut',
      grandChampionNumber: 'GC-901',
    });
    const dam = makeAnimal('dam-1', {
      name: 'Cedar Mist Daisy',
      tattoo: 'CMD2',
      sex: 'Female',
      variety: 'Broken Chestnut',
    });
    const eligibleBuck = makeAnimal('sale-buck', {
      name: 'Briar Patch Comet',
      tattoo: 'BPC3',
      sex: 'Male',
      status: 'Active',
      variety: 'Chestnut',
      sireId: sire.id,
      damId: dam.id,
      forSale: true,
      askingPriceCents: 15_000,
      saleNotes: 'Show prospect buck with dense coat.',
      registrationNumber: 'ARBA-4421',
      legsCount: 2,
      genotype: [{ locus: 'E', allele1: 'E', allele2: 'e' }],
      genotypeRaw: 'Aa B_ C_ D_ Ee',
    });
    const eligibleInquireDoe = makeAnimal('sale-doe', {
      name: 'Briar Patch Blossom',
      tattoo: 'BPB4',
      sex: 'Female',
      species: 'Sheep',
      breed: 'Babydoll Southdown',
      variety: 'White',
      status: 'Junior',
      forSale: true,
      askingPriceCents: 0,
    });
    const soldWithFlag = makeAnimal('sold-1', {
      name: 'Already Sold Bunny',
      status: 'Sold',
      forSale: true,
      askingPriceCents: 9_000,
    });
    const deceasedWithFlag = makeAnimal('dead-1', {
      name: 'Deceased Bunny',
      status: 'Deceased',
      forSale: true,
    });
    const archivedWithFlag = makeAnimal('arch-1', {
      name: 'Archived Bunny',
      status: 'Active',
      archived: true,
      forSale: true,
    });
    const referenceWithFlag = makeAnimal('ref-1', {
      name: 'Reference Buck',
      status: 'Active',
      ownershipType: 'Reference',
      forSale: true,
    });

    expect(isAnimalAvailableForSale(eligibleBuck)).toBe(true);
    expect(isAnimalAvailableForSale(soldWithFlag)).toBe(false);
    expect(isAnimalAvailableForSale(deceasedWithFlag)).toBe(false);
    expect(isAnimalAvailableForSale(archivedWithFlag)).toBe(false);
    expect(isAnimalAvailableForSale(referenceWithFlag)).toBe(false);

    const snapshot = makeEmptySnapshot({
      settings: makeSettings({
        barnName: 'Briar Patch Homestead',
        breederName: 'Meadowbrook Breeder',
        breederEmail: 'sales@briarpatch.example',
        breederPhone: '(555) 234-5678',
        breederLocation: 'Willamette Valley, OR',
        breederWebsite: 'briarpatch.example/stock',
        showcaseTagline: 'Healthy pasture-raised show & fiber stock',
      }),
      animals: [
        sire,
        dam,
        eligibleBuck,
        eligibleInquireDoe,
        soldWithFlag,
        deceasedWithFlag,
        archivedWithFlag,
        referenceWithFlag,
      ],
    });

    const result = buildBreederShowcaseResult(snapshot, {
      todayIso: '2026-11-23',
      includeGenotypes: true,
      appBaseUrl: 'https://example.org/Pedigree/',
      includeQrCode: true,
    });

    expect(result.animalCount).toBe(2);
    expect(result.speciesNames).toEqual(['Rabbit', 'Sheep']);
    expect(result.filename).toBe('briar-patch-homestead-for-sale-showcase-2026-11-23.html');

    // Included animals + pricing + lineage + contact bar
    expect(result.html).toContain('Briar Patch Comet');
    expect(result.html).toContain('$150.00');
    expect(result.html).toContain('Oak Ridge Monarch');
    expect(result.html).toContain('Cedar Mist Daisy');
    expect(result.html).toContain('Briar Patch Blossom');
    expect(result.html).toContain('Inquire for Price');
    expect(result.html).toContain('sales@briarpatch.example');
    expect(result.html).toContain('tel:(555)234-5678');
    expect(result.html).toContain('https://briarpatch.example/stock');
    expect(result.html).toContain('Healthy pasture-raised show &amp; fiber stock');
    expect(result.html).toContain('Aa B_ C_ D_ Ee');
    expect(result.html).toContain('ARBA-4421');
    expect(result.html).toContain('qr-svg');

    // Strictly excluded ineligible records
    expect(result.html).not.toContain('Already Sold Bunny');
    expect(result.html).not.toContain('Deceased Bunny');
    expect(result.html).not.toContain('Archived Bunny');
    expect(result.html).not.toContain('Reference Buck');

    // Species filter scoping
    const rabbitOnly = buildBreederShowcaseResult(snapshot, {
      speciesName: 'Rabbit',
      todayIso: '2026-11-23',
      includeGenotypes: false,
    });
    expect(rabbitOnly.animalCount).toBe(1);
    expect(rabbitOnly.filename).toBe('briar-patch-homestead-rabbit-for-sale-showcase-2026-11-23.html');
    expect(rabbitOnly.html).toContain('Briar Patch Comet');
    expect(rabbitOnly.html).not.toContain('Briar Patch Blossom');
    expect(rabbitOnly.html).not.toContain('Aa B_ C_ D_ Ee');
  });

  it('renders reservation hold badges, wool highlights, active medication withdrawal alerts, and thumbnail preference', () => {
    const angora = makeAnimal('angora-1', {
      name: 'Cloud Nine Willow',
      tattoo: 'CNW8',
      sex: 'Female',
      breed: 'German Angora',
      variety: 'Ruby Eyed White',
      forSale: true,
      askingPriceCents: 22_500,
    });
    const dutch = makeAnimal('dutch-2', {
      name: 'cloverdale Jet',
      tattoo: 'CDJ9',
      sex: 'Male',
      breed: 'Dutch',
      variety: 'Black',
      forSale: true,
      askingPriceCents: 8_500,
    });
    const cancelledOne = makeAnimal('open-3', {
      name: 'Open Meadow Pip',
      sex: 'Female',
      forSale: true,
    });

    const snapshot = makeEmptySnapshot({
      animals: [angora, dutch, cancelledOne],
      animalPhotos: [
        {
          id: 'ph-1',
          species: 'Rabbit',
          animalId: angora.id,
          isPrimary: true,
          sortOrder: 0,
          caption: 'Side pose',
          originalFileName: 'willow.png',
          mimeType: 'image/png',
          width: 800,
          height: 600,
          originalBytes: 12000,
          storedBytes: 9000,
          thumbnailDataUrl: VALID_WEBP_THUMB_URL,
          dataUrl: VALID_PNG_DATA_URL,
          createdAt: '2026-11-01T12:00:00Z',
          updatedAt: '2026-11-01T12:00:00Z',
        },
      ],
      animalReservations: [
        {
          id: 'res-1',
          species: 'Rabbit',
          agreementNumber: 'RES-101',
          clientId: 'cli-1',
          clientName: 'Alice',
          animalId: angora.id,
          itemLabel: angora.name,
          status: 'Deposit Paid',
          reservedDateIso: '2026-11-20',
          holdExpiresDateIso: '',
          totalPriceCents: 22_500,
          depositRequiredCents: 5_000,
          depositPaidCents: 5_000,
          depositDueDateIso: '',
          depositPaidDateIso: '2026-11-20',
          pickupScheduledDateIso: '',
          completedDateIso: '',
          balanceReminderDateIso: '',
          paymentMethod: 'Cash',
          termsSummary: '',
          healthGuaranteeNotes: '',
          notes: '',
          createdAt: '2026-11-20T12:00:00Z',
          updatedAt: '2026-11-20T12:00:00Z',
        },
        {
          id: 'res-2',
          species: 'Rabbit',
          agreementNumber: 'RES-102',
          clientId: 'cli-2',
          clientName: 'Bob',
          animalId: dutch.id,
          itemLabel: dutch.name,
          status: 'Inquiry Hold',
          reservedDateIso: '2026-11-21',
          holdExpiresDateIso: '',
          totalPriceCents: 8_500,
          depositRequiredCents: 2_000,
          depositPaidCents: 0,
          depositDueDateIso: '',
          depositPaidDateIso: '',
          pickupScheduledDateIso: '',
          completedDateIso: '',
          balanceReminderDateIso: '',
          paymentMethod: 'Cash',
          termsSummary: '',
          healthGuaranteeNotes: '',
          notes: '',
          createdAt: '2026-11-21T12:00:00Z',
          updatedAt: '2026-11-21T12:00:00Z',
        },
        {
          id: 'res-3',
          species: 'Rabbit',
          agreementNumber: 'RES-103',
          clientId: 'cli-3',
          clientName: 'Carl',
          animalId: cancelledOne.id,
          itemLabel: cancelledOne.name,
          status: 'Cancelled',
          reservedDateIso: '2026-11-18',
          holdExpiresDateIso: '',
          totalPriceCents: 5_000,
          depositRequiredCents: 0,
          depositPaidCents: 0,
          depositDueDateIso: '',
          depositPaidDateIso: '',
          pickupScheduledDateIso: '',
          completedDateIso: '',
          balanceReminderDateIso: '',
          paymentMethod: 'Cash',
          termsSummary: '',
          healthGuaranteeNotes: '',
          notes: '',
          createdAt: '2026-11-18T12:00:00Z',
          updatedAt: '2026-11-18T12:00:00Z',
        },
      ],
      woolHarvests: [
        {
          id: 'wool-1',
          species: 'Rabbit',
          animalId: angora.id,
          harvestDateIso: '2026-11-10',
          shearingIntervalDays: 90,
          primeWeightGrams: 280,
          gradeWeightGrams: 40,
          harvestMethod: 'Shear',
          notes: '',
          createdAt: '2026-11-10T12:00:00Z',
          updatedAt: '2026-11-10T12:00:00Z',
        },
      ],
      careLogs: [
        {
          id: 'care-w-1',
          species: 'Rabbit',
          animalId: dutch.id,
          dateIso: '2026-11-20',
          type: 'Health / Vet',
          title: 'Ivermectin Dewormer',
          weightGrams: 2100,
          showLegEarned: false,
          medicationName: 'Ivermectin',
          withdrawalDays: 14,
          withdrawalClearDateIso: '2026-12-04',
          notes: '',
          createdAt: '2026-11-20T12:00:00Z',
          updatedAt: '2026-11-20T12:00:00Z',
        },
      ],
    });

    const fullPhotoRes = buildBreederShowcaseResult(snapshot, {
      todayIso: '2026-11-23',
      preferThumbnails: false,
    });
    expect(fullPhotoRes.reservedCount).toBe(2);
    expect(fullPhotoRes.hasPhotosEmbedded).toBe(true);
    expect(fullPhotoRes.activeWithdrawalWarnings).toHaveLength(1);
    expect(fullPhotoRes.activeWithdrawalWarnings[0]).toContain('Ivermectin');
    expect(fullPhotoRes.html).toContain('>Reserved<');
    expect(fullPhotoRes.html).toContain('>On Hold<');
    expect(fullPhotoRes.html).toContain('Medication Withdrawal Hold:');
    expect(fullPhotoRes.html).toContain('Wool / Fiber:');
    expect(fullPhotoRes.html).toContain(VALID_PNG_DATA_URL);

    const thumbRes = buildBreederShowcaseResult(snapshot, {
      todayIso: '2026-11-23',
      preferThumbnails: true,
      layoutMode: 'stock_sheet_only',
    });
    expect(thumbRes.html).toContain('stock-table');
    expect(thumbRes.html).not.toContain('id="showcase-cards-view"');

    const thumbCardRes = buildBreederShowcaseResult(snapshot, {
      todayIso: '2026-11-23',
      preferThumbnails: true,
    });
    expect(thumbCardRes.html).toContain(VALID_WEBP_THUMB_URL);
    expect(thumbCardRes.html).not.toContain(VALID_PNG_DATA_URL);
  });

  it('escapes HTML payloads, blocks unsafe URLs/SVG data URIs, and handles empty catalogs gracefully', () => {
    expect(sanitizeSafeExternalHttpUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeSafeExternalHttpUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(sanitizeSafeExternalHttpUrl('vbscript:msgbox(1)')).toBe('');
    expect(sanitizeSafeExternalHttpUrl('example.com/ranch')).toBe('https://example.com/ranch');

    const malicious = makeAnimal('xss-1', {
      name: '<script>window.pwned=1</script> Star',
      forSale: true,
      saleNotes: 'Line1 <img src=x onerror=alert(1)>',
    });

    const snapshot = makeEmptySnapshot({
      settings: makeSettings({
        barnName: '<script>evilBarn()</script> Ranch',
        breederWebsite: 'javascript:alert(99)',
        breederLogoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=',
      }),
      animals: [malicious],
      animalPhotos: [
        {
          id: 'svg-bad',
          species: 'Rabbit',
          animalId: malicious.id,
          isPrimary: true,
          sortOrder: 0,
          caption: '',
          originalFileName: 'bad.svg',
          mimeType: 'image/svg+xml',
          width: 100,
          height: 100,
          originalBytes: 100,
          storedBytes: 100,
          thumbnailDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          createdAt: '2026-11-01T12:00:00Z',
          updatedAt: '2026-11-01T12:00:00Z',
        },
      ],
    });

    const html = generateBreederShowcaseHtml(snapshot, { todayIso: '2026-11-23' });
    expect(html).not.toContain('<script>window.pwned');
    expect(html).not.toContain('<script>evilBarn');
    expect(html).not.toContain('javascript:alert(99)');
    expect(html).not.toContain('image/svg+xml');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).toContain('&lt;script&gt;window.pwned=1&lt;/script&gt; Star');

    const emptyRes = buildBreederShowcaseResult(makeEmptySnapshot(), {
      speciesName: 'Rabbit',
      todayIso: '2026-11-23',
    });
    expect(emptyRes.animalCount).toBe(0);
    expect(emptyRes.html).toContain('No Animals Currently Listed For Sale');
    expect(buildBreederShowcaseFileName('Sunrise Barn', 'Angora Rabbit', '2026-11-23')).toBe(
      'sunrise-barn-angora-rabbit-for-sale-showcase-2026-11-23.html'
    );
  });

  it('round-trips breeder contact settings and for-sale animal listing fields through JSON backups', () => {
    const buck = makeAnimal('rt-1', {
      name: 'Meadow Starlight',
      sex: 'Male',
      forSale: true,
      askingPriceCents: 18_500,
      saleNotes: 'Friendly disposition, pedigreed.',
    });
    const sold = makeAnimal('rt-2', {
      name: 'Sold Star',
      status: 'Sold',
      forSale: true, // Should be sanitized to false by parseBarnBackupJson
    });

    const snapshot = makeEmptySnapshot({
      settings: makeSettings({
        breederEmail: 'breeder@meadow.example',
        breederPhone: '503-555-0199',
        breederLocation: 'Oregon',
        breederWebsite: 'https://meadow.example',
        showcaseTagline: 'Heritage lines since 2018',
      }),
      animals: [buck, sold],
    });

    const json = exportBarnBackupJson(snapshot);
    const parsed = parseBarnBackupJson(json, makeSettings());

    expect(parsed.settings.breederEmail).toBe('breeder@meadow.example');
    expect(parsed.settings.breederPhone).toBe('503-555-0199');
    expect(parsed.settings.breederLocation).toBe('Oregon');
    expect(parsed.settings.breederWebsite).toBe('https://meadow.example');
    expect(parsed.settings.showcaseTagline).toBe('Heritage lines since 2018');

    const parsedBuck = parsed.animals.find((a) => a.id === 'rt-1')!;
    const parsedSold = parsed.animals.find((a) => a.id === 'rt-2')!;
    expect(parsedBuck.forSale).toBe(true);
    expect(parsedBuck.askingPriceCents).toBe(18_500);
    expect(parsedBuck.saleNotes).toBe('Friendly disposition, pedigreed.');
    expect(parsedSold.forSale).toBe(false);
  });
});
