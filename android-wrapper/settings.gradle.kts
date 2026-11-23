/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * CRITICAL: Thin Android WebView wrapper ONLY. The core PWA lives in /src/ and MUST ALWAYS stay React + Vite + TypeScript.
 */

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "pedigree-android-wrapper"
include(":app")
