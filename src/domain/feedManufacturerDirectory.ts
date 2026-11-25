/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Offline-Ready Feed Manufacturer Emergency & Biosecurity Directory
 * (`src/domain/feedManufacturerDirectory.ts`).
 *
 * CROSS-PLATFORM MIGRATION GUARDRAIL:
 * 100% pure TypeScript with zero browser DOM (`window`, `document`) dependencies.
 * Bundled statically so breeders have hotlines, recall links, lot-code decoding hints,
 * and regulatory reporting contacts even in zero-signal barns.
 */

export type FeedDirectoryCategory =
  | 'manufacturer'
  | 'regulatory'
  | 'community_watch';

export interface FeedManufacturerContact {
  id: string;
  name: string;
  parentCompany: string;
  category: FeedDirectoryCategory;
  hotlinePhone: string;
  hotlineHours: string;
  qualityReportUrl: string;
  recallWatchUrl: string;
  communityWatchNote: string;
  lotCodeHint: string;
  speciesFocus: string[];
  aliases: string[];
}

export const FEED_MANUFACTURER_DIRECTORY: ReadonlyArray<FeedManufacturerContact> = [
  {
    id: 'purina-animal-nutrition',
    name: 'Purina Animal Nutrition',
    parentCompany: "Land O'Lakes / Purina Mills",
    category: 'manufacturer',
    hotlinePhone: '1-800-227-8941',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT',
    qualityReportUrl: 'https://www.purinamills.com/contact-us',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Keep the sewn paper feed tag & mill stamp photo ready; Purina tracks plant ID + Julian date stamps on the white tag tape.',
    lotCodeHint:
      'Look on the white bottom/top stitched tag or inked gusset for plant code + Julian date (e.g. 24185 or 4291A-0814).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Poultry'],
    aliases: ['purina', 'purina mills', 'land o lakes', 'show chow', 'fibre3', 'complete rabbit'],
  },
  {
    id: 'nutrena-cargill',
    name: 'Nutrena (Cargill Animal Nutrition)',
    parentCompany: 'Cargill',
    category: 'manufacturer',
    hotlinePhone: '1-800-367-4894',
    hotlineHours: 'Mon–Fri 8:00 AM–5:00 PM CT',
    qualityReportUrl: 'https://www.nutrenaworld.com/contact-us',
    recallWatchUrl: 'https://www.nutrenaworld.com/safety-quality',
    communityWatchNote:
      'Record both the lot code and the mill/plant number stamped on the bag seam before reporting refusal, mold, or off-odor.',
    lotCodeHint:
      'Usually printed on the stitched bag tag or bag seam in YYDDD + plant/shift format (e.g. L26045-03).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Poultry'],
    aliases: ['nutrena', 'cargill', 'country feeds', 'naturewise', 'safechoice'],
  },
  {
    id: 'kent-blue-seal',
    name: 'Kent Nutrition Group / Blue Seal',
    parentCompany: 'Kent Corporation',
    category: 'manufacturer',
    hotlinePhone: '1-866-647-1212',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT',
    qualityReportUrl: 'https://kentfeeds.com/contact/',
    recallWatchUrl: 'https://blueseal.com/contact-us/',
    communityWatchNote:
      'Covers Kent, Blue Seal, and Home Fresh lines. Retain a sealed 1–2 lb sample in a clean zip bag if a lab assay is requested.',
    lotCodeHint:
      'Printed on the sewn feed tag or inkjet bag edge as a batch/run number + date code.',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Poultry'],
    aliases: ['kent', 'blue seal', 'home fresh', 'show rabbit', 'kent nutrition'],
  },
  {
    id: 'kalmbach-feeds',
    name: 'Kalmbach Feeds',
    parentCompany: 'Kalmbach Feeds, Inc.',
    category: 'manufacturer',
    hotlinePhone: '1-888-771-1250',
    hotlineHours: 'Mon–Fri 8:00 AM–5:00 PM ET',
    qualityReportUrl: 'https://www.kalmbachfeeds.com/pages/contact-us',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Popular among ARBA rabbitries and small ruminants; customer care can verify lot retain samples directly from the mill.',
    lotCodeHint:
      'Stamped on the white guarantee tag or bottom closure tape (e.g. LOT 26088A or 0326-K1).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Poultry'],
    aliases: ['kalmbach', 'heinz', 'tribute', 'formula of champions'],
  },
  {
    id: 'manna-pro',
    name: 'Manna Pro Products',
    parentCompany: 'Compana Pet Brands',
    category: 'manufacturer',
    hotlinePhone: '1-800-690-9908',
    hotlineHours: 'Mon–Fri 8:00 AM–5:00 PM CT',
    qualityReportUrl: 'https://www.mannapro.com/contact-us',
    recallWatchUrl: 'https://www.mannapro.com/recall-information',
    communityWatchNote:
      'Covers Pro Formula, Sho, Select Series, and Calf-Manna supplements. Keep UPC + best-by / lot stamp together.',
    lotCodeHint:
      'Inkjet lot stamp near bottom gusset or back panel (e.g. LOT 4192M / Best By MM/DD/YY).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Guinea Pig', 'Chinchilla'],
    aliases: ['manna pro', 'mannapro', 'calf-manna', 'sho', 'select series'],
  },
  {
    id: 'adm-pen-pals',
    name: 'ADM Animal Nutrition (Pen Pals)',
    parentCompany: 'Archer Daniels Midland',
    category: 'manufacturer',
    hotlinePhone: '1-800-217-2007',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT',
    qualityReportUrl: 'https://www.admanimalnutrition.com/webcenter/portal/ADMAnimalNutrition/pages_contact',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Covers Pen Pals Rabbit, MoorMan’s ShowTec, and Patriot lines. Include dealer city/state when reporting a lot.',
    lotCodeHint:
      'Look on the white tag or lot sticker for Plant ID + Date/Batch (e.g. QU-26102-4).',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle'],
    aliases: ['adm', 'pen pals', 'penpals', 'moormans', 'showtec'],
  },
  {
    id: 'tractor-supply-producers-pride',
    name: "Tractor Supply (Producer's Pride / Dumor)",
    parentCompany: 'Tractor Supply Co.',
    category: 'manufacturer',
    hotlinePhone: '1-877-718-6750',
    hotlineHours: 'Daily 7:00 AM–9:00 PM CT',
    qualityReportUrl: 'https://www.tractorsupply.com/tsc/cms/customer-solutions',
    recallWatchUrl: 'https://www.tractorsupply.com/tsc/cms/product-recall',
    communityWatchNote:
      'Store-brand bags are co-packed regionally—both the lot stamp AND store receipt/city help trace the exact contract mill.',
    lotCodeHint:
      'Stamped on the white bottom tape or rear seam alongside a 3-letter mill/plant code.',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Poultry'],
    aliases: ['tractor supply', 'tsc', 'producers pride', "producer's pride", 'dumor'],
  },
  {
    id: 'mazuri-exotic',
    name: 'Mazuri Exotic Animal Nutrition',
    parentCompany: "PMI Nutrition International / Land O'Lakes",
    category: 'manufacturer',
    hotlinePhone: '1-800-227-8941',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT',
    qualityReportUrl: 'https://mazuri.com/pages/contact-us',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Commonly fed to Guinea Pigs, Chinchillas, and small exotics; check Vitamin C stabilization / mill date carefully.',
    lotCodeHint:
      'Printed near top or bottom seal with MFG / Best By date and 5–7 character lot code.',
    speciesFocus: ['Guinea Pig', 'Chinchilla', 'Ferret', 'Rabbit'],
    aliases: ['mazuri', 'pmi nutrition'],
  },
  {
    id: 'standlee-forage',
    name: 'Standlee Premium Products',
    parentCompany: 'Standlee Hay Company',
    category: 'manufacturer',
    hotlinePhone: '1-800-398-0819',
    hotlineHours: 'Mon–Fri 8:00 AM–5:00 PM MT',
    qualityReportUrl: 'https://www.standleeforage.com/contact/',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Covers timothy/alfalfa compressed bales, cubes, and forage pellets. Photograph bale wrap lot stickers before discarding.',
    lotCodeHint:
      'White adhesive barcode/lot sticker on plastic bale sleeve or bag gusset (e.g. ST-26071).',
    speciesFocus: ['Rabbit', 'Guinea Pig', 'Chinchilla', 'Goat', 'Sheep', 'Cattle', 'Alpaca'],
    aliases: ['standlee', 'hay', 'timothy', 'alfalfa'],
  },
  {
    id: 'fda-cvm-safety-portal',
    name: 'FDA CVM Safety Reporting & Feed Recall Watch',
    parentCompany: 'U.S. Food & Drug Administration (Center for Veterinary Medicine)',
    category: 'regulatory',
    hotlinePhone: '1-888-463-6332',
    hotlineHours: '24/7 Online Portal · Phone Mon–Fri 8:00 AM–4:30 PM ET',
    qualityReportUrl: 'https://www.safetyreporting.hhs.gov/',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals',
    communityWatchNote:
      'Submit adverse livestock feed events directly to FDA CVM with your indexed lot number, mill code, bag photos, and affected pen records.',
    lotCodeHint:
      'Have Manufacturer, Product Name, Lot/Batch Code, Purchase Date, and Vet/Mortality notes ready before filing.',
    speciesFocus: ['Rabbit', 'Goat', 'Sheep', 'Swine / Pig', 'Cattle', 'Guinea Pig', 'Chinchilla', 'Ferret', 'Alpaca', 'Dog', 'Cat'],
    aliases: ['fda', 'cvm', 'recall', 'safety reporting', 'government', 'adverse event'],
  },
  {
    id: 'arba-community-feed-watch',
    name: 'ARBA & Barn Biosecurity Feed-Issue Watch',
    parentCompany: 'Community & Specialty Breeder Biosecurity Resources',
    category: 'community_watch',
    hotlinePhone: '1-309-664-7500',
    hotlineHours: 'Mon–Fri 8:00 AM–4:30 PM CT (ARBA Office)',
    qualityReportUrl: 'https://arba.net/',
    recallWatchUrl: 'https://www.fda.gov/animal-veterinary/recalls-withdrawals/animal-feed-recalls',
    communityWatchNote:
      'Cross-check regional mill alerts with local breeders, freeze a 1 lb labeled retain sample from suspect lots, and flag the lot in your ledger to trace exposed cages & litters.',
    lotCodeHint:
      'Always log both the mill code and lot string so multi-barn growers can compare exact plant/shift batches.',
    speciesFocus: ['Rabbit', 'Guinea Pig', 'Goat', 'Sheep'],
    aliases: ['arba', 'community', 'watch', 'biosecurity', 'mycotoxin', 'feed issue'],
  },
];

/**
 * Pure search & filter helper for the offline manufacturer directory.
 */
export function filterFeedManufacturerDirectory(params: {
  query?: string;
  speciesName?: string;
  category?: FeedDirectoryCategory | 'all';
}): FeedManufacturerContact[] {
  const q = (params.query || '').trim().toLowerCase();
  const species = (params.speciesName || '').trim().toLowerCase();
  const category = params.category || 'all';

  return FEED_MANUFACTURER_DIRECTORY.filter((entry) => {
    if (category !== 'all' && entry.category !== category) {
      return false;
    }
    if (
      species &&
      species !== 'all' &&
      entry.category === 'manufacturer' &&
      !entry.speciesFocus.some((s) => s.toLowerCase() === species)
    ) {
      return false;
    }
    if (!q) return true;
    const haystack = [
      entry.name,
      entry.parentCompany,
      entry.hotlinePhone,
      entry.lotCodeHint,
      entry.communityWatchNote,
      ...entry.aliases,
      ...entry.speciesFocus,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Finds the best matching bundled manufacturer contact for a typed or OCR-detected feed brand.
 */
export function matchManufacturerForBrand(brandText: string): FeedManufacturerContact | null {
  const clean = (brandText || '').trim().toLowerCase();
  if (!clean) return null;
  for (const entry of FEED_MANUFACTURER_DIRECTORY) {
    if (entry.category !== 'manufacturer') continue;
    if (entry.name.toLowerCase().includes(clean) || clean.includes(entry.name.toLowerCase())) {
      return entry;
    }
    if (entry.aliases.some((alias) => clean.includes(alias) || alias.includes(clean))) {
      return entry;
    }
  }
  return null;
}
