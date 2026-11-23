// Top-level build file for Pedigree Android Wrapper
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// CRITICAL: This directory is ONLY a thin Kotlin WebView shell serving the React + Vite + TypeScript PWA
// built from /src/ into assets/www/. NEVER recode or replace the core PWA with Kotlin.

plugins {
    id("com.android.application") version "8.13.0" apply false
    id("org.jetbrains.kotlin.android") version "2.3.21" apply false
}
