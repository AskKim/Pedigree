/*
 * Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * CRITICAL HYBRID BOUNDARY:
 * This module is ONLY a thin AndroidX WebView container packaging the React + Vite + TypeScript PWA (/src/ -> dist/ -> assets/www/).
 * NEVER convert, rewrite, or replace the React PWA UI or domain logic with Kotlin or Jetpack Compose.
 */

import java.io.File
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun wrapperProp(name: String, defaultValue: String): String {
    return (project.findProperty(name) as String?)?.trim()?.takeIf { it.isNotEmpty() } ?: defaultValue
}

fun escapeBuildConfigString(value: String): String {
    val escaped = value.replace("\\", "\\\\").replace("\"", "\\\"")
    return "\"$escaped\""
}

val wrapperApplicationId = wrapperProp("pedigree.wrapper.applicationId", "org.askkim.pedigree.wrapper")
val wrapperVersionCode = wrapperProp("pedigree.wrapper.versionCode", "1").toIntOrNull() ?: 1
val wrapperVersionNameOverride = (project.findProperty("pedigree.wrapper.versionName") as String?)
    ?.trim()
    ?.takeIf { it.isNotEmpty() }
val wrapperAssetHost = wrapperProp("pedigree.wrapper.assetHost", "appassets.androidplatform.net")
val wrapperBridgeObjectName = wrapperProp("pedigree.wrapper.bridgeObjectName", "pedigreeNative")
val wrapperDebugPagesHost = wrapperProp("pedigree.wrapper.debugPagesHost", "askkim.github.io")
val wrapperDebugPagesPathPrefix = wrapperProp("pedigree.wrapper.debugPagesPathPrefix", "/Pedigree")
val wrapperVaultDirName = wrapperProp("pedigree.wrapper.vaultDirName", "pedigree-vault")
val wrapperPrintDocumentName = wrapperProp("pedigree.wrapper.printDocumentName", "Pedigree")
val wrapperAppName = wrapperProp("pedigree.wrapper.appName", "Pedigree")
val wrapperDebugAppName = wrapperProp("pedigree.wrapper.debugAppName", "$wrapperAppName (Debug)")
val wrapperDebugPrefsName = wrapperProp("pedigree.wrapper.debugPrefsName", "pedigree_wrapper_debug_prefs")
val wrapperDiagnosticsClipLabel = wrapperProp("pedigree.wrapper.diagnosticsClipLabel", "$wrapperAppName Diagnostics")
val wrapperDefaultExportFilename = wrapperProp("pedigree.wrapper.defaultExportFilename", "pedigree-export.bin")

android {
    namespace = "org.askkim.pedigree.wrapper"
    compileSdk = 36

    defaultConfig {
        applicationId = wrapperApplicationId
        // Android 8.0+ (API 26) supports WebViewAssetLoader, Safe Browsing, and modern WebMessageCompat.
        minSdk = 26
        targetSdk = 36
        versionCode = wrapperVersionCode
        versionName = "0.1.0-alpha.3"
        if (wrapperVersionNameOverride != null) {
            versionName = wrapperVersionNameOverride
        }

        buildConfigField("String", "ASSET_HOST", escapeBuildConfigString(wrapperAssetHost))
        buildConfigField("String", "BRIDGE_OBJECT_NAME", escapeBuildConfigString(wrapperBridgeObjectName))
        buildConfigField("String", "DEBUG_PAGES_HOST", escapeBuildConfigString(wrapperDebugPagesHost))
        buildConfigField("String", "DEBUG_PAGES_PATH_PREFIX", escapeBuildConfigString(wrapperDebugPagesPathPrefix))
        buildConfigField("String", "VAULT_DIR_NAME", escapeBuildConfigString(wrapperVaultDirName))
        buildConfigField("String", "PRINT_DOCUMENT_NAME", escapeBuildConfigString(wrapperPrintDocumentName))
        buildConfigField("String", "DEBUG_PREFS_NAME", escapeBuildConfigString(wrapperDebugPrefsName))
        buildConfigField("String", "DIAGNOSTICS_CLIP_LABEL", escapeBuildConfigString(wrapperDiagnosticsClipLabel))
        buildConfigField("String", "DEFAULT_EXPORT_FILENAME", escapeBuildConfigString(wrapperDefaultExportFilename))
        buildConfigField(
            "String",
            "ACTION_OPEN_DIAGNOSTICS",
            escapeBuildConfigString("$wrapperApplicationId.action.OPEN_DIAGNOSTICS")
        )

        resValue("string", "app_name", wrapperAppName)
        resValue(
            "string",
            "dev_panel_debug_url_invalid",
            "Debug URL must use https://$wrapperDebugPagesHost$wrapperDebugPagesPathPrefix/"
        )
        resValue("string", "shortcut_action_open_diagnostics", "$wrapperApplicationId.action.OPEN_DIAGNOSTICS")
        resValue("string", "shortcut_target_package", wrapperApplicationId)
        resValue("string", "shortcut_target_class", "org.askkim.pedigree.wrapper.MainActivity")
    }

    buildFeatures {
        buildConfig = true
    }

    // Reproducible & F-Droid friendly: omit Google dependency metadata blobs
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }

    // Release signing credentials are supplied via CI environment variables (never committed).
    val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
    val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
    val keyAliasEnv = System.getenv("ANDROID_KEY_ALIAS")
    val keyPasswordEnv = System.getenv("ANDROID_KEY_PASSWORD")
    val hasReleaseSigning = !keystorePath.isNullOrBlank() &&
        !keystorePassword.isNullOrBlank() &&
        !keyAliasEnv.isNullOrBlank() &&
        !keyPasswordEnv.isNullOrBlank() &&
        File(keystorePath).exists()

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = File(keystorePath!!)
                storePassword = keystorePassword
                keyAlias = keyAliasEnv
                keyPassword = keyPasswordEnv
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
            isMinifyEnabled = false
            resValue("string", "app_name", wrapperDebugAppName)
            resValue("string", "shortcut_target_package", "$wrapperApplicationId.debug")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            if (hasReleaseSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/LICENSE*",
                "META-INF/NOTICE*",
                "META-INF/*.kotlin_module"
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

// Strict minimal dependency policy: pure AndroidX WebView/Custom Tabs/AppCompat only.
// No Google Play Services, Firebase, Capacitor, or proprietary analytics/crash SDKs.
dependencies {
    implementation("androidx.appcompat:appcompat:1.8.0")
    implementation("androidx.webkit:webkit:1.15.0")
    implementation("androidx.browser:browser:1.10.0")
}
