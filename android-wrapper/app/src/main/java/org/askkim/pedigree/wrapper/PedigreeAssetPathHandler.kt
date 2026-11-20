/*
 * Community Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.IOException
import java.net.URLConnection
import java.util.Locale

/**
 * Serves bundled Vite `dist/` files from `assets/www/` under `https://appassets.androidplatform.net/`
 * with explicit MIME types required for Android 8+ WebViews (`.wasm`, `.js`, `.mjs`, `.webmanifest`).
 *
 * Why `WebViewAssetLoader` instead of `file://`?
 * Loading a modern ES-module SPA from `file:///android_asset/` triggers strict `null`-origin
 * CORS errors on `<script type="module">`, `fetch()`, Service Workers, and IndexedDB/OPFS.
 * `WebViewAssetLoader` maps a virtual HTTPS origin (`appassets.androidplatform.net`) directly to
 * APK assets completely offline without making any real network request.
 */
class PedigreeAssetPathHandler(context: Context) : WebViewAssetLoader.PathHandler {

    private val appContext = context.applicationContext

    /**
     * Resolves an incoming virtual HTTPS path (e.g. `""`, `"assets/index-abc.js"`, or a
     * client-side SPA route like `"herd"`) to a [WebResourceResponse] backed by APK assets.
     *
     * Returns `null` for traversal attempts or missing asset files so WebView returns a 404.
     */
    override fun handle(path: String): WebResourceResponse? {
        val sanitized = sanitizeRelativePath(path) ?: return null
        val targetPath = if (sanitized.isEmpty() || sanitized.endsWith("/")) {
            "${sanitized}index.html"
        } else {
            sanitized
        }

        val (resolvedPath, stream) = openAssetWithSpaFallback(targetPath) ?: return null
        val mimeInfo = resolveMimeType(resolvedPath)
        val headers = HashMap<String, String>(2)
        headers["X-Content-Type-Options"] = "nosniff"
        // Keep entry HTML, version probe, and Service Worker scripts uncached so APK updates
        // take effect immediately; hashed Vite bundle assets under `assets/` are immutable.
        if (
            resolvedPath == "index.html" ||
            resolvedPath == "version.json" ||
            resolvedPath.endsWith("sw.js") ||
            resolvedPath.endsWith("service-worker.js")
        ) {
            headers["Cache-Control"] = "no-cache"
        } else if (resolvedPath.startsWith("assets/")) {
            headers["Cache-Control"] = "public, max-age=31536000, immutable"
        }

        return WebResourceResponse(
            mimeInfo.mimeType,
            mimeInfo.encoding,
            200,
            "OK",
            headers,
            stream
        )
    }

    /**
     * Opens `assets/www/<candidate>`. If missing and the path has no file extension (indicating a
     * client-side SPA route rather than a missing `.js`/`.png`/`.wasm` file), falls back to
     * `assets/www/index.html`.
     */
    private fun openAssetWithSpaFallback(candidate: String): Pair<String, java.io.InputStream>? {
        try {
            return candidate to appContext.assets.open("www/$candidate")
        } catch (_: IOException) {
            // SPA client-side route fallback only when the path has no file extension
            val lastSegment = candidate.substringAfterLast('/')
            if (!lastSegment.contains('.')) {
                return try {
                    "index.html" to appContext.assets.open("www/index.html")
                } catch (_: IOException) {
                    null
                }
            }
            return null
        }
    }

    /**
     * Strips query/hash suffixes and rejects backslashes, null bytes, and `.` / `..` segments
     * to prevent directory-traversal reads outside `assets/www/`.
     */
    private fun sanitizeRelativePath(rawPath: String): String? {
        val withoutQuery = rawPath.substringBefore('?').substringBefore('#')
        if (withoutQuery.contains('\\') || withoutQuery.contains('\u0000')) {
            return null
        }
        var trimmed = withoutQuery.trimStart('/')
        if (trimmed.isEmpty()) {
            return ""
        }
        while (trimmed.contains("//")) {
            trimmed = trimmed.replace("//", "/")
        }
        val segments = trimmed.split('/')
        for (segment in segments) {
            if (segment == ".." || segment == ".") {
                return null
            }
        }
        return trimmed
    }

    private data class MimeInfo(val mimeType: String, val encoding: String?)

    /**
     * Maps file extensions explicitly because Android 8–10 `URLConnection.guessContentTypeFromName`
     * frequently returns `null` or `application/octet-stream` for `.mjs`, `.wasm`, and `.webmanifest`,
     * which causes Chromium WebView to refuse executing ES modules or WebAssembly.
     */
    private fun resolveMimeType(path: String): MimeInfo {
        val ext = path.substringAfterLast('.', "").lowercase(Locale.US)
        return when (ext) {
            "html", "htm" -> MimeInfo("text/html", "UTF-8")
            "js", "mjs" -> MimeInfo("application/javascript", "UTF-8")
            "css" -> MimeInfo("text/css", "UTF-8")
            "wasm" -> MimeInfo("application/wasm", null)
            "json", "webmanifest", "map" -> MimeInfo("application/json", "UTF-8")
            "svg" -> MimeInfo("image/svg+xml", "UTF-8")
            "png" -> MimeInfo("image/png", null)
            "jpg", "jpeg" -> MimeInfo("image/jpeg", null)
            "webp" -> MimeInfo("image/webp", null)
            "avif" -> MimeInfo("image/avif", null)
            "gif" -> MimeInfo("image/gif", null)
            "ico" -> MimeInfo("image/x-icon", null)
            "woff2" -> MimeInfo("font/woff2", null)
            "woff" -> MimeInfo("font/woff", null)
            "ttf" -> MimeInfo("font/ttf", null)
            "otf" -> MimeInfo("font/otf", null)
            "pdf" -> MimeInfo("application/pdf", null)
            "ogg", "opus" -> MimeInfo("audio/ogg", null)
            "mp3" -> MimeInfo("audio/mpeg", null)
            "mp4" -> MimeInfo("video/mp4", null)
            "webm" -> MimeInfo("video/webm", null)
            "txt", "md", "csv", "tsv", "ics" -> MimeInfo("text/plain", "UTF-8")
            "sqlite", "db", "zip" -> MimeInfo("application/octet-stream", null)
            else -> {
                val guessed = URLConnection.guessContentTypeFromName(path)
                val mime = if (guessed.isNullOrBlank()) "application/octet-stream" else guessed
                val encoding = if (mime.startsWith("text/")) "UTF-8" else null
                MimeInfo(mime, encoding)
            }
        }
    }
}
