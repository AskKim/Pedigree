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

## Architecture & Critical Stack Rule (Hybrid React PWA + Thin Android Wrapper)

> **CRITICAL RULE — Core PWA MUST Always Stay in React:**
> Even though `/android-wrapper/` introduces Kotlin and Gradle files and creates a hybrid repository, **the core application and PWA (`/src/`, `index.html`, `vite.config.ts`) MUST ALWAYS remain React + Vite + TypeScript**.
> - **Web & Core App (`/src/`):** 100% React 19 + Vite + TypeScript + Tailwind CSS offline-first PWA.
> - **Android Wrapper (`/android-wrapper/`):** Strictly a **thin native Kotlin WebView shell** (`WebViewAssetLoader` + IPC bridges) that packages and serves the built React `dist/` bundle offline inside an APK.
> - **Never Recode the PWA in Kotlin:** Never rewrite, convert, or migrate the web app/UI/domain logic into Kotlin or Jetpack Compose—even when troubleshooting bootability or importing from GitHub. See [AGENTS.md](./AGENTS.md) and [android-wrapper/README.md](./android-wrapper/README.md).

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

## GitHub Actions Workflows (Quick Guide)

All automated checks, builds, website deployments, Android APKs, and codebase exports run in GitHub's **Actions** tab (no local setup needed). See the step-by-step beginner's guide in [.github/WORKFLOWS_GUIDE.md](./.github/WORKFLOWS_GUIDE.md).

- **CI (`ci.yml`)** *(Automatic on push/PR)* — Runs tests, improvement checks, TypeScript checks, and production/Pages builds.
- **Deploy to GitHub Pages (`deploy-pages.yml`)** *(Push to `release` or manual)* — Publishes the live PWA website.
- **Build Android APK (`build-android-apk.yml`)** *(Push/PR to `main` or manual)* — Packages the React PWA into downloadable Debug & Release `.apk` files.
- **Export Codebase to Markdown (`export_repo_to_md.yml`)** *(Manual)* — Splits the repo into <= 100 KB parts, converts each to Markdown, and saves two flat ZIPs inside a dated folder under `export/`.
- **Extract Android Wrapper (`unzip.yml`)** *(Manual)* — Unpacks a root `.zip` into `android-wrapper/` and cleans up the archive.
- **Repo Guardrails & Workflow Validation (`guardrails.yml`)** *(Automatic on push/PR or manual)* — Validates all workflow files, keeps `import/`, `export/`, `upload/`, and `master_system_prompt.md` safe, and blocks accidental `/import/` bundling.
- **Security & Dependency Hygiene Audit (`security-audit.yml`)** *(Weekly / dependency edits / manual)* — Checks for leaked secrets/keystores, enforces Android minimal-dependency rules, and runs an advisory `npm audit`.
- **Release PWA & Android Bundle (`release.yml`)** *(Version tags `v*.*.*` or manual)* — Verifies cross-file version sync, packages the built PWA `.zip` and thin Android WebView `.apk` files with `.sha256` checksums, and attaches both to the GitHub Release on tags.

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for full details.

### Public Agencies and Research Collaborations

We actively welcome collaboration with public agricultural agencies, land-grant universities, and open research initiatives (including the USDA and related breeding programs). If your organization needs alternative licensing terms—such as Apache 2.0—to integrate this work into public-interest tools, please open an issue or contact the project maintainer directly to discuss a separate licensing agreement.

