# ProGuard / R8 rules for Community Pedigree Android Wrapper
# SPDX-License-Identifier: AGPL-3.0-or-later

-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

-keep class org.askkim.pedigree.wrapper.MainActivity { *; }
-keep class org.askkim.pedigree.wrapper.BuildConfig { *; }
-keep class androidx.webkit.** { *; }
-dontwarn androidx.webkit.**
