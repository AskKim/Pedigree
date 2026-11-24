# Community Pedigree Project

- **Project Name:** Community Pedigree Project
- **App Name:** Community Pedigree
- **Repository:** [`pedigree`](https://github.com/pedigree) (GitHub paths stay `pedigree`)
- **Package Name:** `pedigree` (lowercase package identifier for `package.json` and the eventual `.apk` / bundle ID segment, e.g., `<reverse-domain>.pedigree`)
- **License:** Agplv3 

**Community Pedigree** is an open-source, offline-first livestock registry, cage-side breeding & chore manager, coat color genetics lab, and recursive Wright Coefficient of Inbreeding (COI) pedigree engine—initially tailored for ARBA **New Zealand Red** rabbitry workflows and built out across multi-species livestock.

## Key Capabilities

- **Zero Lock-In Unencrypted Local SQLite:** Runs standard relational SQLite locally on your hardware (`sql.js` WebAssembly + IndexedDB in browsers; ready for `expo-sqlite` on native Android/iOS) with zero accounts, subscriptions, or proprietary cloud servers.
- **Multi-Species Barn Hub + Startup Pinning:** Configure biological gestation, weaning, rebreeding, and Master Task List rules across 9 built-in livestock presets (**Rabbit, Goat, Sheep, Swine / Pig, Cattle, Guinea Pig, Chinchilla, Ferret, Alpaca**) or custom species. Pin any species hub to launch straight into it on startup, or open on the All-Species Barn Home page.
- **Strict Per-Species Isolation:** Each species workspace strictly scopes its Herd, Sire/Dam pickers, Breeding & COI Lab, Barn Chores, Cages, Shows, and Pedigree Explorer to that species alone.
- **Automated Master Task List Chore Cascading:** Logging a breeding automatically calculates and schedules downstream chores (e.g., Day 14 Palpation, Day 28 Place Nestbox, Day 31 Expected Kindling, Day 42 Weaning, and Rebreed readiness).
- **Recursive Pedigree & Wright COI Engine:** Interactive 3- and 4-generation pan/zoom Bezier pedigree trees with exact memoized coancestry COI, shared ancestor path decomposition, and linebreeding occurrence indicators (`2×`, `3×`).
- **Coat Color Genetics & Allele Inference:** Structured ARBA rabbit coat color loci (`A, B, C, D, E, W, En, V, Du`), hidden recessive allele inference from parents and offspring, genetic conflict detection, and test-breeding Punnett predictions.
- **Open Portability & Multi-Device Sync:** 1-click exports to raw `.sqlite`, `.json` (v5 + backward-compatible import of v3/v4 backups), `.csv`, Evans-compatible `.HTM` pedigrees, printable PDF pedigree certificates, and 4"×2" thermal cage cards, plus deterministic UUID + ISO-8601 `updatedAt` multi-device file merging.

## Local Development

```bash
npm install
npm run dev
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the pure TypeScript domain layout and Expo / React Native migration guide.
