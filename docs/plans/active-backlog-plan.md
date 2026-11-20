# Active Backlog Plan — Color-Coded Allele Provenance, Unique-Ancestor Dimming & Registration Flags

**Backlog Item:** #1 — Color-Coded Allele Provenance, Unique-Ancestor Dimming & Registration Flags (`IMP-038`)

## Implementation Plan

1. **Pure TS Allele Provenance Engine (`src/core/geneticsEngine.ts`)**
   - Add `AlleleProvenanceSource` (`'sire' | 'dam' | 'offspring' | 'manual' | 'unknown'`), `AnnotatedAllele`, `AnnotatedLocusPair`, and `AnimalAlleleProvenanceResult`.
   - Implement `analyzeAlleleProvenance(subject, herdById, allSpeciesAnimals, speciesName?, options?)` supporting autosomal Mendelian elimination, homozygous parental guarantees, offspring-proven recessive/intermediate alleles (both saved and uncommitted via `includeInferred`), X-linked (`Cat O/o`) sex-chromosome provenance (`Y` from Sire, `X` from Dam/Sire), and strict `null`/fallback isolation for custom species.

2. **Pure TS Convergence & ARBA Registration Engine (`src/core/pedigreeAnalysis.ts`)**
   - Implement `isArbaRegistrationSpecies(speciesName)` scoped strictly to ARBA species (`Rabbit`, `Guinea Pig` / `Cavy`) with zero cross-species bleed-through.
   - Implement `evaluateAnimalArbaRegistration` and `analyzePedigreeTree(subject, slots, speciesName?)` to:
     - Classify repeated convergent ancestors (`occurrenceCount > 1` in Gen `>= 1`) vs. unique non-convergent ancestors.
     - Flag Generation 0–3 nodes in red when missing objective ARBA registration requirements (`tattoo`, `breed`, `variety`, `weightGrams > 0`, subject `birthDateIso`, subject `sex`, incomplete 3-gen lineage `< 14`, breed mismatch in 3-gen ancestors, or empty Gen 1–3 ancestor slots) with exact deficiency labels, while excluding Gen 4–6 nodes from ARBA blocking checks.

3. **Reusable Color-Coded Genotype Component (`src/components/ColoredGenotypeDisplay.tsx`)**
   - Render allele pairs colored by provenance using theme-aware CSS variables (`--barn-slate` Sire, `--barn-terracotta` Dam, `--barn-sage` Offspring-inferred with dotted underline, `--barn-ink` Manual, `--barn-muted` Unknown `_`) with accessible hover tooltips and reusable `AlleleProvenanceLegend`.

4. **UI Integration (`PedigreeScreen.tsx`, `HerdScreen.tsx`, `BreedingScreen.tsx`)**
   - `PedigreeScreen`: Add **Dim Unique** (convergence spotlight, auto-active when convergent ancestors exist and toggleable) and **ARBA Reg Flags** (for ARBA species, toggleable, default ON) controls; dim unique non-convergent ancestor cards and their connector paths when spotlighting convergence; highlight ARBA-deficient Gen 0–3 cards/slots in red with exact deficiency details and summary notice; render color-coded allele provenance on pedigree cards + legend.
   - `HerdScreen`: Render color-coded allele provenance with legend in the Genetics & Allele Inference card and preview uncommitted inferred allele provenance before saving.
   - `BreedingScreen`: Show color-coded Sire/Dam allele provenance in the Coat Color Punnett panel alongside Sire/Dam pair highlights.

5. **Verification & Registry Sync**
   - Add unit tests in `src/core/__tests__/pedigreeAnalysis.test.ts`.
   - Register `IMP-038` in `src/core/improvementRegistry.ts` and sync `IMPROVEMENTS.md`.
   - Run `npm test`, `npm run verify:improvements`, `npm run lint`, and `npm run build` (`compile_applet` + `lint_applet`).
