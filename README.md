# Community Pedigree Project

[![Live Web App](https://img.shields.io/badge/Live%20PWA-askkim.github.io%2FPedigree-2ea44f?style=flat-square&logo=googlechrome&logoColor=white)](https://askkim.github.io/Pedigree/)
[![GitHub Pages](https://github.com/AskKim/Pedigree/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/AskKim/Pedigree/actions/workflows/deploy-pages.yml)
[![CI](https://github.com/AskKim/Pedigree/actions/workflows/ci.yml/badge.svg)](https://github.com/AskKim/Pedigree/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPLv3-blue.svg)](./LICENSE)

- **Live Web App (GitHub Pages):** [https://askkim.github.io/Pedigree/](https://askkim.github.io/Pedigree/)
- **Project Name:** Community Pedigree Project
- **App Name:** Community Pedigree
- **Repository:** [`AskKim/Pedigree`](https://github.com/AskKim/Pedigree) (GitHub paths stay `AskKim/Pedigree`)
- **Package Name:** `pedigree` (lowercase package identifier for `package.json` and the eventual `.apk` / bundle ID segment, e.g., `<reverse-domain>.pedigree`)
- **License:** GNU AGPLv3 (`AGPL-3.0-or-later`) — see [LICENSE](./LICENSE)

**Community Pedigree** is an open-source, offline-first livestock registry, cage-side breeding & chore manager, coat color genetics lab, and recursive Wright Coefficient of Inbreeding (COI) pedigree engine—initially tailored for ARBA **New Zealand Red** rabbitry workflows and built out across multi-species livestock. Launch the live web app directly in any browser at [https://askkim.github.io/Pedigree/](https://askkim.github.io/Pedigree/).

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

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for full details. Official mobile builds distributed through platforms with restrictive terms (such as the Apple App Store) may be released under the Apache License 2.0 to comply with platform requirements.

### Public Agencies and Research Collaborations

We actively welcome collaboration with public agricultural agencies, land-grant universities, and open research initiatives (including the USDA and related breeding programs). If your organization needs alternative licensing terms—such as Apache 2.0—to integrate this work into public-interest tools, please open an issue or contact the project maintainer directly to discuss a separate licensing agreement.

