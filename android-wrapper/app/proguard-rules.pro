# ProGuard / R8 rules for Community Pedigree Android Wrapper
# SPDX-License-Identifier: AGPL-3.0-or-later

-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

-keep class androidx.webkit.** { *; }
-keep interface org.chromium.support_lib_boundary.** { *; }
-dontwarn androidx.webkit.**
-dontwarn org.chromium.support_lib_boundary.**
