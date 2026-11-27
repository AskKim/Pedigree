import { describe, expect, it } from 'vitest';
import {
  buildBreedingCertificateFileName,
  buildPetBirthCertificateFileName,
  generateBreedingCertificateHtml,
  generatePetBirthCertificateHtml,
} from '../alternativeCertificates';
import { BreedingRecord } from '../models';
import { makeAnimal, makeSettings, makeSpeciesProfile } from './testFixtures';

describe('alternativeCertificates — Pet-Sale Birth Cert & Breeding Certificate HTML', () => {
  it('generates pet-sale Birth Certificate omitting breeder contact info and all pricing', () => {
    const sire = makeAnimal('sire-1', {
      name: 'Cloud Nine',
      sex: 'Male',
      breed: 'Holland Lop',
      variety: 'Broken Tort',
    });
    const dam = makeAnimal('dam-1', {
      name: 'Sweet Pea',
      sex: 'Female',
      breed: 'Holland Lop',
      variety: 'Blue',
    });
    const kit = makeAnimal('kit-1', {
      name: 'Buttercup <script>alert(1)</script>',
      tattoo: 'PET01',
      breed: 'Holland Lop',
      variety: 'Cream',
      sex: 'Female',
      birthDateIso: '2026-04-12',
      weightGrams: 920,
      sireId: 'sire-1',
      damId: 'dam-1',
      buyerName: 'The Miller Family',
      salePriceCents: 17500,
      purchaseCostCents: 5000,
      breederName: 'SecretBreederLLC',
    });
    const settings = makeSettings({
      barnName: 'HiddenAcresPhone555-999-0000',
      breederName: 'breeder@secret.example',
      breederLogoDataUrl: 'data:image/png;base64,AAAA',
    });

    const filename = buildPetBirthCertificateFileName(kit);
    expect(filename).toMatch(/^birth-certificate-.*\.htm$/);

    const html = generatePetBirthCertificateHtml(
      kit,
      [kit, sire, dam],
      [makeSpeciesProfile('Rabbit')],
      settings,
      {
        companionFamilyName: 'The <Miller> Family',
        keepsakeMessage: 'May Buttercup bring joy!',
        primaryPhotoDataUrl: 'javascript:alert(1)',
      }
    );

    expect(html).toContain('Certificate of Birth');
    expect(html).toContain('The &lt;Miller&gt; Family');
    expect(html).toContain('May Buttercup bring joy!');
    expect(html).toContain('Cloud Nine');
    expect(html).toContain('Sweet Pea');
    // Strict XSS escaping + unsafe URL blocking
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('javascript:alert(1)');
    // Strict privacy: breeder contact / barn commercial header / sale price omitted
    expect(html).not.toContain('$175');
    expect(html).not.toContain('175.00');
    expect(html).not.toContain('50.00');
    expect(html).not.toContain('HiddenAcresPhone555-999-0000');
    expect(html).not.toContain('breeder@secret.example');
    expect(html).not.toContain('SecretBreederLLC');
  });

  it('generates Breeding / Service Certificate with Sire, Dam, service dates, COI, fees & outcome', () => {
    const sire = makeAnimal('s1', {
      name: 'Thunderbolt',
      tattoo: 'TB9',
      sex: 'Male',
      breed: 'German Angora',
      variety: 'Ruby-Eyed White',
      registrationNumber: 'REG-778',
      grandChampionNumber: 'GC-12',
      ownerName: 'Apex Stud',
    });
    const dam = makeAnimal('d1', {
      name: 'Snowflake',
      tattoo: 'SF4',
      sex: 'Female',
      breed: 'German Angora',
      variety: 'Ruby-Eyed White',
      ownerName: 'Oak Dam',
    });
    const breeding: BreedingRecord = {
      id: 'b-cert-1',
      species: 'Rabbit',
      sireId: 's1',
      damId: 'd1',
      sireName: 'Thunderbolt',
      damName: 'Snowflake',
      bredDateIso: '2026-03-01',
      expectedDueDateIso: '2026-04-01',
      actualBirthDateIso: '2026-04-02',
      projectedCoiPercent: 3.125,
      liveCount: 6,
      stillbornCount: 1,
      fosteredCount: 0,
      weanedCount: 5,
      offspringCreated: true,
      status: 'Weaned',
      serviceFeeCents: 4500,
      serviceFeeDirection: 'earned',
      notes: 'Double cover AM & PM',
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-04-02T10:00:00.000Z',
    };

    const filename = buildBreedingCertificateFileName(breeding);
    expect(filename).toBe('breeding-certificate-thunderbolt-x-snowflake-2026-03-01.htm');

    const html = generateBreedingCertificateHtml(
      breeding,
      sire,
      dam,
      makeSpeciesProfile('Rabbit'),
      makeSettings({ barnName: 'Meadowbrook Rabbitry', currencyCode: 'USD' }),
      {
        breederContactLine: 'contact@meadowbrook.example · (555) 123-4567',
        serviceNotes: 'Witnessed service <verified>',
      }
    );

    expect(html).toContain('Official Breeding Certificate');
    expect(html).toContain('Thunderbolt');
    expect(html).toContain('Snowflake');
    expect(html).toContain('Reg REG-778');
    expect(html).toContain('GC GC-12');
    expect(html).toContain('3.13%');
    expect(html).toContain('$45.00 (Stud Fee Received)');
    expect(html).toContain('6 Live');
    expect(html).toContain('5 Weaned');
    expect(html).toContain('Witnessed service &lt;verified&gt;');
    expect(html).toContain('contact@meadowbrook.example');
  });
});
