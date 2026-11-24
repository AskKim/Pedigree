# GitHub Actions Workflows — Beginner's Guide

GitHub Actions are automated helpers that run on GitHub's servers whenever you save code or click a button. You do **not** need to install developer tools on your own computer to use them.

## Where to Find and Run Workflows on GitHub

1. Open your repository on GitHub (`AskKim/Pedigree`).
2. Click the **Actions** tab near the top of the page.
3. On the left sidebar, click the workflow you want to view or run.
4. For **manual** workflows (or any workflow that supports manual runs):
   - Click the **Run workflow** button on the right.
   - Choose your branch (usually `main`), fill in any optional boxes, and click the green **Run workflow** button.
5. When the run finishes with a green checkmark, click the run title to see the summary and download any attached **Artifacts** (ZIPs or APKs) at the bottom of the page.

---

## Quick Overview of All 8 Workflows

| Workflow Name (in GitHub Actions) | File | When It Runs | What It Does in Plain English |
| --- | --- | --- | --- |
| **CI** | `ci.yml` | Automatic on every push & Pull Request | Runs all unit tests, checks code rules, and verifies the web app builds cleanly. |
| **Deploy to GitHub Pages** | `deploy-pages.yml` | Push to `release` branch, or manual | Builds and publishes the live website on GitHub Pages. |
| **Build Android APK** | `build-android-apk.yml` | Push/PR to `main`, or manual | Packages the web app inside the Android wrapper and gives you downloadable `.apk` files. |
| **Export Codebase to Markdown** | `export_repo_to_md.yml` | Manual only | Splits the codebase into <= 100 KB pieces, converts each to Markdown, and saves two flat ZIPs inside `export/`. |
| **Extract Android Wrapper** | `unzip.yml` | Manual only | Unpacks a `.zip` file placed at the repo root into `android-wrapper/` and cleans up the `.zip`. |
| **Repo Guardrails & Workflow Validation** | `guardrails.yml` | Automatic on every push & PR, or manual | Checks that workflow files are valid and protected folders (`import/`, `export/`, `upload/`) are intact. |
| **Security & Dependency Hygiene Audit** | `security-audit.yml` | Weekly (Mondays), dependency edits, or manual | Checks that no secret keys were committed and checks packages for known security issues. |
| **Release PWA & Android Bundle** | `release.yml` | On version tags (`v*.*.*`), or manual | Verifies version alignment, builds the PWA `.zip` and thin Android WebView `.apk` files with `.sha256` checksums, and attaches both to the GitHub Release. |

---

## Detailed Guide for Each Workflow

### 1. CI (`ci.yml`) — *Automatic Quality Check*
- **When to use it:** It runs by itself every time you push changes or open a Pull Request. You don't have to click anything.
- **What it checks:**
  1. Runs all automated tests (`npm test`).
  2. Checks that no saved app features were accidentally overwritten (`npm run verify:improvements`).
  3. Checks TypeScript code for mistakes (`npm run lint`).
  4. Tests building the app for both `/` and GitHub Pages subpaths.
- **How to read results:** Green checkmark = safe to merge. Red X = click the run to see which test or build step failed.

### 2. Deploy to GitHub Pages (`deploy-pages.yml`) — *Publish the Live Website*
- **When to use it:** When you want to publish the latest web app to your live `github.io` link.
- **One-time GitHub setup:** In your GitHub repository go to **Settings → Pages** and set **Source** to **GitHub Actions**.
- **How to run it:**
  - **Automatic:** Push or merge code into the `main` or `release` branch.
  - **Manual:** Go to **Actions → Deploy to GitHub Pages → Run workflow**.
- **Note:** This workflow intentionally uses **Bun** (do not replace Bun with npm here).

### 3. Build Android APK (`build-android-apk.yml`) — *Create the Android App*
- **When to use it:** Whenever you want an `.apk` file you can install on an Android phone or tablet.
- **How to run it:**
  - Runs automatically on pushes/PRs to `main`, or click **Actions → Build Android APK → Run workflow**.
- **How to get the APK:**
  1. Open the finished workflow run.
  2. Scroll down to **Artifacts**.
  3. Download **`pedigree-debug-apk`** (easiest for testing on your own phone) or **`pedigree-release-apk`**.
- **Optional release signing:** If you add `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` under **Settings → Secrets and variables → Actions**, the release APK will be signed automatically.

### 4. Export Codebase to Markdown (`export_repo_to_md.yml`) — *Save a Readable Snapshot*
- **When to use it:** When you want a clean, easy-to-share snapshot of all source code and docs split into small (<= 100 KB) pieces so AI tools or viewers don't cut them off.
- **How to run it:**
  1. Click **Actions → Export Codebase to Markdown → Run workflow**.
  2. Optional inputs:
     - **`output_dir`**: Folder to save into (default: `export`).
     - **`max_part_kb`**: Max size per part in KB (default: `100`; enter `0` for one single unsplit file).
  3. Click **Run workflow**.
- **What you get:**
  - Inside `export/<RepoName>-<YYYY-MM-DD>/` (committed to the repo and also attached under **Artifacts**), it creates **two flat ZIP files** (with no internal folders inside either ZIP):
    1. **`<RepoName>-export-files-<YYYY-MM-DD>.zip`** — contains `index.md` and `part-001.md`, `part-002.md`, ... directly at the root of the ZIP.
    2. **`<RepoName>-markdown-files-<YYYY-MM-DD>.zip`** — contains a converted `*-converted.md` file (with a Table of Contents and verification checksum) for every export file directly at the root of the ZIP.

### 5. Extract Android Wrapper (`unzip.yml`) — *Unpack a Zipped Android Wrapper*
- **When to use it:** Only when you upload a `.zip` containing `android-wrapper` files to the top/root folder of the repository and want GitHub to unzip it for you.
- **How to run it:**
  1. Upload your `.zip` file to the root of the repository (same level as `package.json`).
  2. Go to **Actions → Extract Android Wrapper → Run workflow**.
  3. It unzips the files into `android-wrapper/`, deletes the `.zip`, and commits the extracted files.

### 6. Repo Guardrails & Workflow Validation (`guardrails.yml`) — *Safety & Structure Check*
- **When to use it:** Runs automatically on every push and Pull Request (or manually via **Run workflow**).
- **What it protects:**
  - Makes sure all workflow `.yml` files have valid syntax.
  - Verifies the protected folders (`import/`, `export/`, `upload/` and their `.gitkeep` files) and `prompts/master_system_prompt.md` have not been deleted.
  - Confirms `/import/` is never accidentally imported into the live React app.

### 7. Security & Dependency Hygiene Audit (`security-audit.yml`) — *Weekly Safety Check*
- **When to use it:** Runs automatically every Monday at 06:00 UTC, when dependencies or Android Gradle files change, or manually via **Run workflow**.
- **What it checks:**
  - Confirms no `.env` secret files or keystore files (`.jks`, `.keystore`, `.pem`, `.p12`) were accidentally committed.
  - Confirms `android-wrapper/` stays free of tracking/Play Services/Firebase SDKs.
  - Runs an advisory `npm audit` report to flag known high/critical package vulnerabilities.

### 8. Release PWA & Android Bundle (`release.yml`) — *Create a Versioned Release (PWA + Android APK)*
- **When to use it:** When you are ready to package a clean build of both the web PWA and the Android WebView APK for distribution or create an official GitHub Release.
- **Can it run on other branches?** Yes — in **Actions → Release PWA & Android Bundle → Run workflow**, use the **Use workflow from** dropdown to pick any branch that already has `.github/workflows/release.yml` on it. *(Note: if an older branch like `release` was created before `release.yml` existed, use GitHub's **Releases → Draft a new release** page instead and set **Target** to that branch!)*
- **How to run it:**
  - **Manual test/download (or publish from a branch):** Go to **Actions → Release PWA & Android Bundle → Run workflow**, choose the branch, type a version like `v0.1.0-alpha.2`, and optionally check **Also create an official GitHub Release & tag on the selected branch** (check pre-release for alpha/beta versions).
  - **Official GitHub Release via tag:** Push a Git tag starting with `v` (for example `v0.1.0-alpha.2`). The workflow automatically verifies version sync, builds the PWA `.zip` and Android `.apk` packages, generates `.sha256` checksums, and attaches everything to the GitHub Release under **Releases**.

---

## Related Step-by-Step Guides
- [How to Create a GitHub Release (Now & After Updating)](../docs/HOW_TO_CREATE_A_RELEASE.md)
- [How to Update the `release` Branch From `main`](../docs/HOW_TO_UPDATE_RELEASE_FROM_MAIN.md)

