# Coat Color Genetics Upgrade Plan (All Species)

- **Project:** Community Pedigree (`AskKim/Pedigree`)
- **Status:** Implemented (Pending Expert Species Genetics Sign-Off)
- **Primary Target Modules:** `src/core/geneticsEngine.ts`, `src/core/carrierGenetics.ts`, `src/core/models.ts`, `src/core/importers/herdBossImporter.ts`, `src/core/importers/conflictResolver.ts`, `src/core/__tests__/geneticsEngine.test.ts`, `src/core/__tests__/carrierGenetics.test.ts`, `src/components/AnimalEditorModal.tsx`, `src/components/HerdScreen.tsx`, `src/components/PedigreeScreen.tsx`, `src/components/BreedingScreen.tsx`, `src/components/ColorGeneticsNotice.tsx`

> **Mandatory Guardrail:** `ColorGeneticsNotice` ("not working yet / needs expert verification") **must remain visible** anywhere coat color genotypes, allele inference, or Punnett predictions are shown—even after this upgrade is implemented—until a species coat-color genetics expert reviews and signs off on each species ruleset.

---

## Why This Upgrade Is Needed

Currently, `src/core/geneticsEngine.ts` defines only `RABBIT_COLOR_LOCI` (`A`, `B`, `C`, `D`, `E`, `W`, `En`, `V`, `Du`) and `RABBIT_VARIETY_GENOTYPE_PRESETS`. Every call to `parseGenotypeString`, `inferHiddenAlleles`, and `simulatePairingGenetics` applies rabbit dominance hierarchies and feeds outcomes into `classifyRabbitPhenotype`, regardless of the animal's actual species. Additionally, there are logic bugs in the existing rabbit engine and no safe fallback for user-added custom species.

---

## Phase 1 — Species-Scoped Genetics Registry & Core Architecture

1. **Create a species registry inside `src/core/geneticsEngine.ts` (100% pure TypeScript, zero DOM coupling):**
   - Define `SpeciesGeneticsSpec`:
     - `speciesKey`: canonical species identifier matching `PREDEFINED_SPECIES_PRESETS` (plus synonym/alias lookup).
     - `loci`: `LocusDefinition[]` where each locus specifies:
       - `locus`: short code (e.g., `A`, `B`, `C`, `D`, `E`, `O`, `K`, `M`, etc.)
       - `name`: human-readable locus name
       - `alleles`: ordered dominant -> recessive
       - `inheritanceMode`: `'autosomal' | 'x_linked' | 'incomplete_dominant' | 'codominant'`
       - `description`: plain-English explanation of alleles and pairings
       - `healthWarnings?`: optional homozygous or pairing risk metadata
     - `varietyPresets`: `Record<string, string>` of baseline coat/variety genotypes for that species
     - `classifyPhenotype(loci, sex?)`: species-specific coat color & pattern predictor
   - Implement `getGeneticsSpecForSpecies(speciesName: string): SpeciesGeneticsSpec | null` (returns `null` for manually entered/custom species).
2. **Thread `speciesName` (and `sex` where needed) into engine functions:**
   - Update `parseGenotypeString(raw, speciesName?)`
   - Update `inferHiddenAlleles(subject, herdById, allSpeciesAnimals, speciesName?)`
   - Update `simulatePairingGenetics(sire, dam, speciesName?)`
   - Update all UI and import callers (`AnimalEditorModal.tsx`, `HerdScreen.tsx`, `BreedingScreen.tsx`, `conflictResolver.ts`, `syncAndExports.ts`).

---

## Phase 2 — Fix Core Engine Math & Inference Bugs (All Species)

1. **Fix homozygous-dominant parent inference (`inferHiddenAlleles`):**
   - Currently `pLocus.allele1 !== current.allele1` prevents inferring from a homozygous dominant parent (`AA`) when the offspring has `A_`. Fix parent-to-offspring checking so any homozygous parent (`X/X`) fills `_` in the offspring or flags an impossible conflict.
2. **Normalize `'_'` unknown slot ordering:**
   - Ensure inferred or parsed pairs normalize unknown placeholders to `allele_`, never `_allele`.
3. **Fix intermediate recessive inference from offspring:**
   - Currently offspring-to-parent inference only checks `mostRecessive` (`alleles[alleles.length - 1]`). Expand it so homozygous intermediate alleles (e.g., `atat` or `chdchd` in rabbits, `cbcb` or `cscs` in cats, `kyky` or `atat` in dogs) also prove parental carriage and catch conflicts.
4. **Fix `'_'` handling in `simulatePairingGenetics`:**
   - Stop crossing `'_'` as a literal allele (which currently yields nonsense genotypes like `25% __`).
   - Separate **confirmed Punnett outcomes** from **unconfirmed carrier possibilities** when either parent contains `_`, surfacing clear uncertainty badges rather than fabricated homozygous-blank genotypes.
5. **Add X-linked Punnett & inference logic (`inheritanceMode: 'x_linked'`):**
   - Support sex-stratified offspring outcomes (Male `XY` inherits single allele from Dam; Female `XX` inherits one allele from Sire and one from Dam) and validate Sire single-allele representation vs. Dam paired representation.

---

## Phase 3 — Per-Species Loci, Variety Presets & Phenotype Classifiers (All 11 Predefined Species)

1. **Rabbit (fix missing ARBA classifications & NZ Red Wide-Band safeguard):**
   - Keep `A, B, C, D, E, W, En, V, Du` and expand `classifyRabbitPhenotype` to classify:
     - `at` (Tan / Otter / Silver Marten)
     - `chl` (Sable / Siamese Sable / Seal / Sable Point)
     - `ch` (Himalayan / Californian Pointed)
     - `vv` (Blue-Eyed White / BEW)
     - `dudu` (Dutch belted)
     - `ej` (Harlequin / Tricolor)
     - `Es` (Steel)
     - Distinguish verified Wide-Band (`ee ww`) from non-wide-band (`ee W_`) and Wide-Band Unverified (`ee __`).
   - **Conservative Preset & Interactive Verification Gate:**
     - Variety presets for `Red`, `New Zealand Red`, and `Broken Red` start conservative (`A_ B_ C_ D_ ee __` / `A_ B_ C_ D_ ee __ Enen`) with optional unchecked confirmation prompts (`Confirm Wide-Band (ww)`) before writing `ww` into `genotypeRaw`.
     - Newly created Rabbit forms start blank (`''`) rather than silently defaulting to `A_ B_ C_ D_ ee ww`.
   - **Standalone Rufus Intensity Selector (`rufusLevel`):**
     - Track polygenic red pigment richness (`Unspecified`, `High`, `Medium`, `Low`) independently of Mendelian `W/w` across UI, SQLite, JSON, CSV, and Barn Binders.
   - **Importer Non-Assumption:**
     - HerdBoss / CSV / JSON importers leave Wide-Band open unless explicitly present in a `Genotype` column; `"Red"` variety strings never trigger silent `ww` or `rufusLevel` assumptions.
2. **Cat:**
   - `A` (`A, a`): Agouti/Tabby vs Solid
   - `B` (`B, b, b1`): Black / Chocolate / Cinnamon
   - `C` (`C, cb, cs, c`): Full color / Burmese sepia / Siamese point / Albino (plus Mink `cbcs` codominance)
   - `D` (`D, d`): Dense / Dilute (Blue, Lilac, Fawn, Cream)
   - `O` (**X-linked** `O, o`): Red/Orange vs Non-Red; `Oo` females produce Tortoiseshell / Calico; split Male vs Female Punnett predictions
   - `W` / `Ws`: Dominant White vs White Spotting / Bicolor
   - `Mc` / `Ta`: Mackerel/Classic/Ticked Tabby
   - `I`: Inhibitor (Silver / Smoke)
3. **Dog:**
   - `A` (`ay, aw, at, a`): Sable / Wolf Sable / Tan Point / Recessive Black
   - `K` (`KB, kbr, ky`): Dominant Black / Brindle / Express Agouti (`kyky` required for `A`-locus expression)
   - `E` (`Em, Eg, E, e`): Melanistic Mask / Grizzle / Normal / Recessive Red-Cream (epistatic over `K`/`A` when `ee`)
   - `B` (`B, b`): Black vs Liver/Chocolate nose & coat
   - `D` (`D, d`): Dilute (Blue / Isabella)
   - `M` (`M, m`): Merle (incomplete dominant; flag `MM` double-merle)
   - `S` (`S, sp`): Solid vs Piebald / Irish Spotting
   - `H` (`H, h`): Harlequin modifier (on Merle)
   - `I` (`I, i`): Phaeomelanin intensity (Red -> Cream)
4. **Goat:**
   - `A` (`Awt, Ab, As, At, A, a` / codominant Agouti series): White/Tan, Badgerface, Swiss Markings, Black & Tan, Bezoar/Wild, Recessive Solid Black (explicitly accounting for codominance in caprine Agouti combinations)
   - `B` (`B, b`): Black / Brown
   - `E` (`ED, E+, e`): Dominant Black / Wild / Red
   - Pattern modifiers: Spotting, Moonspots, Roan (`Rn`)
5. **Sheep:**
   - `A` (`Awt, Ab, At, Aa`): White-Tan / Badgerface / Mouflon-Black & Tan / Self-Black
   - `B` (`B, b`): Black / Moorit-Brown
   - `E` (`ED, E+`): Dominant Black / Wild
   - `S`: Spotting / Piebald
6. **Cattle:**
   - `E` (`ED, E+, e`): Dominant Black / Wild / Recessive Red
   - `D` (`D, d`): Dun dilution
   - `R` (`R, r`): Roan (codominant)
   - `P` / `S`: Belted / Whiteface (Hereford) / Spotting
7. **Swine / Pig:**
   - `E` (`ED, E+, ep, e`): Dominant Black / Wild / Black-Spotted-Red / Red
   - `I`: Dominant White
   - `Be`: Hampshire Belt
   - `Rn`: Roan
8. **Alpaca:**
   - `E` (`E, e`): Base pigment control
   - `A`: Agouti hierarchy (White / Light Fawn / Medium-Dark Fawn / Brown / True Black)
   - `G`: Grey / Tuxedo / Appaloosa / Roan
9. **Guinea Pig:**
   - `A` (`A, ar, a`): Agouti / Solid-ticked / Self
   - `B` (`B, b`): Black / Chocolate
   - `C` (`C, ck, cd, cr, ca`): Full / Dark-dilute / Cream-Buff / Red-eyed Himalayan / Albino
   - `E` (`E, ep, e`): Extension / Tortoiseshell-Brindle / Red-Gold
   - `P` (`P, p`): Pink-eyed dilution (Lilac / Saffron)
   - `S` (`S, s`): Dutch / White spotting
   - `Rn`: Roan / Dalmatian (flag `RnRn` lethal)
10. **Chinchilla:**
    - Dominant mutations: `Wh` (Wilson White), `TO` (Black Velvet / TOV), `Bg` (Beige — codominant/incomplete dominant)
    - Recessive mutations: `v` (Violet), `s` (Sapphire), `eb` (Charcoal / Ebony), `al` (Albino)
    - Homozygous lethal tracking for `WhWh` and `TOTO`
11. **Ferret:**
    - Base & albino: `B`/`b` (Sable vs Pastel/Chocolate), `c` (Albino / DEW modifiers)
    - Pattern/white-marking loci: `Panda`, `Blaze`, `Silver/Roan`, `Mitts` (with Waardenburg deafness-risk flags on Blaze/Panda crosses)

---

## Phase 4 — Custom / Manually Entered Species Fallback

1. When `getGeneticsSpecForSpecies(speciesName)` returns `null` (any species manually created by a user outside the 11 predefined presets):
   - Do **not** parse tokens against Rabbit loci or label offspring with Rabbit coat colors.
   - Allow storing plain-text genotype / DNA / color marker notes safely in `genotypeRaw`.
   - In the Breeding Lab and Herd Detail views, display raw parent genotype strings side-by-side without running species-specific Punnett predictions (future enhancement: optional user-defined custom 2-allele loci per custom species).

---

## Phase 5 — Health & Lethal Combination Warnings

Surface clear breeding alerts in `PunnettSimulationSummary` and the Breeding Lab UI when a pairing has non-zero probability of producing known lethal or sensory-defect genotypes:

- **Dog:** Double Merle (`MM`) — elevated risk of congenital deafness and microphthalmia/blindness.
- **Guinea Pig:** Homozygous Roan/Dalmatian (`RnRn`) — lethal white / microphthalmia risk.
- **Chinchilla:** Homozygous Wilson White (`WhWh`) or Black Velvet (`TOTO`) — embryonic lethal factor.
- **Rabbit:** Homozygous English (`EnEn`) — Charlie pattern megacolon predisposition.
- **Ferret:** Blaze / Panda x Blaze / Panda — elevated Waardenburg syndrome / deafness risk.

---

## Phase 6 — UI Wiring, Carrier Integration, Tests & Expert Review Sign-Off

1. **Animal Editor (`src/components/AnimalEditorModal.tsx`):**
   - Switch locus builder rows, allele quick-picks, and conservative variety presets dynamically based on the active species (`null` fallback hides coat presets and shows plain genotype/DNA notes for custom species).
   - Never auto-populate `Red` or `ww` on blank Rabbits; prompt explicit verification checkboxes (e.g., Wide-Band `ww` on `New Zealand Red` / `Red`) before populating uncertain loci.
   - Provide the separate **Rufus Intensity** selector (`High` / `Medium` / `Low`) and the **Suspected / Confirmed / Cleared** carrier comboboxes with test-mating proof metadata.
2. **Herd Detail (`src/components/HerdScreen.tsx`):**
   - Pass active species into `inferHiddenAlleles` and label allele notes using that species' locus definitions.
   - Expose **Carrier Finder** filters (All / Has Suspected or Confirmed / Confirmed / Cleared / Trait Search) and render per-branch `analyzeAnimalCarrierLineage` firewalls (showing `Cleared (Non-Carrier)` proofs, homozygous dominant coat clearances, `Lineage Potential Carriers`, and blocked branch notices).
3. **Breeding Lab (`src/components/BreedingScreen.tsx`):**
   - Render autosomal vs. sex-split (Male/Female) Punnett outcomes when X-linked loci apply (e.g., Cat `O/o`).
   - Display Phase 5 health/lethal pairing alerts (plus unverified Wide-Band `Red × Red` warning) and **Carrier Disclosure Pairing Risks** (`analyzePairingCarrierRisks`) across shared direct and lineage-potential traits.
4. **Tests (`src/core/__tests__/geneticsEngine.test.ts`, `src/core/__tests__/carrierGenetics.test.ts`):**
   - Add per-species Punnett and inference tests across all 11 predefined species, X-linked Cat orange/tortie crosses, homozygous-dominant parent inference, intermediate recessive inference (`atat`, `chdchd`), unknown `_` carrier handling, NZ Red `ww` confirmation gating, lethal-warning triggers, custom-species isolation, and hybrid per-branch carrier firewalls.
5. **Expert Verification Gate:**
   - Keep `ColorGeneticsNotice` visible across Animal Editor, Herd Animal Detail, and Breeding Lab until each species genetics model has been reviewed and verified by a domain expert.
