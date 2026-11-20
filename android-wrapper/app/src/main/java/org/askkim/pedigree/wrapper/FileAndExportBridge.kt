/*
 * Community Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContract
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicLong

/**
 * Handles WebView `<input type="file">` selection via [ActivityResultContracts.OpenDocument] /
 * [ActivityResultContracts.OpenMultipleDocuments] and binary exports/shares (`BEGIN_BINARY_TRANSFER`
 * + `ArrayBuffer`) off the UI thread via SAF (`ACTION_CREATE_DOCUMENT`) or [FileProvider] +
 * `Intent.ACTION_SEND`.
 *
 * Why is this bridge needed?
 * Inside Android `WebView`, `<a download="backup.zip" href="blob:...">` links are silently
 * ignored and `<input type="file">` does nothing unless [WebChromeClient.onShowFileChooser] is
 * implemented and registered via AndroidX Activity Result launchers.
 */
class FileAndExportBridge(
    private val activity: AppCompatActivity
) {
    private val appContext: Context = activity.applicationContext
    private val mainHandler = Handler(Looper.getMainLooper())
    private val ioExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val shareSequence = AtomicLong(0L)

    private var pendingFilePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingTransfer: PendingBinaryTransfer? = null
    private var pendingSavePayload: PendingSavePayload? = null
    private var destroyed = false

    private val openSingleDocumentLauncher: ActivityResultLauncher<Array<String>> =
        activity.registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            val callback = pendingFilePathCallback
            pendingFilePathCallback = null
            if (callback != null) {
                callback.onReceiveValue(if (uri != null) arrayOf(uri) else null)
            }
        }

    private val openMultipleDocumentsLauncher: ActivityResultLauncher<Array<String>> =
        activity.registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            val callback = pendingFilePathCallback
            pendingFilePathCallback = null
            if (callback != null) {
                val result = if (uris.isNotEmpty()) uris.toTypedArray() else null
                callback.onReceiveValue(result)
            }
        }

    private val createDocumentLauncher: ActivityResultLauncher<CreateDocumentRequest> =
        activity.registerForActivityResult(CreateDocumentWithMimeContract()) { uri ->
            val payload = pendingSavePayload
            pendingSavePayload = null
            if (uri != null && payload != null && !destroyed) {
                writeBytesToDocumentUriAsync(uri, payload.filename, payload.bytes)
            }
        }

    /**
     * Bridges `<input type="file">` taps from Chromium WebView to Android's system file picker.
     * Always resolves any orphaned [pendingFilePathCallback] first, because leaving a WebView
     * `ValueCallback` uninvoked permanently freezes future `<input type="file">` clicks.
     */
    fun onShowFileChooser(
        @Suppress("UNUSED_PARAMETER") webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>,
        fileChooserParams: WebChromeClient.FileChooserParams?
    ): Boolean {
        if (destroyed) {
            filePathCallback.onReceiveValue(null)
            return true
        }

        // Always settle any unfulfilled previous callback so the WebView file input never locks up
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = filePathCallback

        val mimeTypes = resolveAcceptMimeTypes(fileChooserParams?.acceptTypes)
        val allowMultiple =
            fileChooserParams?.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE

        return try {
            if (allowMultiple) {
                openMultipleDocumentsLauncher.launch(mimeTypes)
            } else {
                openSingleDocumentLauncher.launch(mimeTypes)
            }
            true
        } catch (_: Exception) {
            pendingFilePathCallback?.onReceiveValue(null)
            pendingFilePathCallback = null
            showToast(activity.getString(R.string.file_picker_unavailable))
            true
        }
    }

    /**
     * Phase 1 of a binary export/share: records file metadata (`filename`, `mimeType`, `mode`,
     * `expectedByteLength`) from the `BEGIN_BINARY_TRANSFER` JSON envelope so the immediately
     * following `TYPE_ARRAY_BUFFER` frame knows where to write. Also supports an inline
     * `base64Data` fallback for legacy WebViews without `WEB_MESSAGE_ARRAY_BUFFER`.
     */
    fun beginBinaryTransfer(requestId: String, payload: JSONObject?) {
        if (destroyed || payload == null) return

        val rawFilename = payload.optString("filename", "pedigree-export.bin")
        val filename = sanitizeFilename(rawFilename)
        val mimeType = sanitizeMimeType(payload.optString("mimeType", "application/octet-stream"))
        val mode = if (payload.optString("mode", "save").equals("share", ignoreCase = true)) {
            TransferMode.SHARE
        } else {
            TransferMode.SAVE
        }
        val expectedByteLength = payload.optLong("byteLength", -1L)

        // Optional inline base64 fallback for legacy WebViews without WEB_MESSAGE_ARRAY_BUFFER
        val inlineBase64 = if (payload.isNull("base64Data")) "" else payload.optString("base64Data", "")
        if (inlineBase64.isNotEmpty()) {
            pendingTransfer = null
            val decoded = try {
                Base64.decode(inlineBase64, Base64.DEFAULT)
            } catch (_: IllegalArgumentException) {
                return
            }
            dispatchBinaryTransfer(
                PendingBinaryTransfer(
                    requestId = requestId,
                    filename = filename,
                    mimeType = mimeType,
                    mode = mode,
                    expectedByteLength = expectedByteLength
                ),
                decoded
            )
            return
        }

        pendingTransfer = PendingBinaryTransfer(
            requestId = requestId,
            filename = filename,
            mimeType = mimeType,
            mode = mode,
            expectedByteLength = expectedByteLength
        )
    }

    /** Clears any staged transfer metadata when a frame mismatch or WebView teardown occurs. */
    fun clearPendingTransfer() {
        pendingTransfer = null
    }

    /**
     * Phase 2 of a binary export/share: validates the incoming `ArrayBuffer` byte length against
     * `expectedByteLength` and launches SAF save or `FileProvider` share.
     */
    fun handleIncomingBinaryPayload(bytes: ByteArray) {
        if (destroyed) return
        val transfer = pendingTransfer ?: return
        pendingTransfer = null

        if (transfer.expectedByteLength >= 0L && bytes.size.toLong() != transfer.expectedByteLength) {
            showToast(activity.getString(R.string.export_save_failed))
            return
        }

        dispatchBinaryTransfer(transfer, bytes)
    }

    /** Settles any open file-picker callback, clears pending payloads, and shuts down the I/O executor. */
    fun destroy() {
        destroyed = true
        mainHandler.removeCallbacksAndMessages(null)
        pendingFilePathCallback?.onReceiveValue(null)
        pendingFilePathCallback = null
        pendingTransfer = null
        pendingSavePayload = null
        ioExecutor.shutdown()
    }

    private fun dispatchBinaryTransfer(transfer: PendingBinaryTransfer, bytes: ByteArray) {
        when (transfer.mode) {
            TransferMode.SAVE -> launchSafSave(transfer.filename, transfer.mimeType, bytes)
            TransferMode.SHARE -> shareViaFileProviderAsync(transfer.filename, transfer.mimeType, bytes)
        }
    }

    private fun launchSafSave(filename: String, mimeType: String, bytes: ByteArray) {
        val runLaunch = Runnable {
            if (destroyed || activity.isFinishing || activity.isDestroyed) return@Runnable
            pendingSavePayload = PendingSavePayload(filename = filename, bytes = bytes)
            try {
                createDocumentLauncher.launch(CreateDocumentRequest(filename = filename, mimeType = mimeType))
            } catch (_: ActivityNotFoundException) {
                pendingSavePayload = null
                showToast(activity.getString(R.string.export_save_failed))
            }
        }

        if (Looper.myLooper() == Looper.getMainLooper()) {
            runLaunch.run()
        } else {
            mainHandler.post(runLaunch)
        }
    }

    private fun writeBytesToDocumentUriAsync(uri: Uri, filename: String, bytes: ByteArray) {
        if (destroyed || ioExecutor.isShutdown) return
        try {
            ioExecutor.execute {
                val wrote = try {
                    val stream = try {
                        appContext.contentResolver.openOutputStream(uri, "wt")
                    } catch (_: Exception) {
                        appContext.contentResolver.openOutputStream(uri)
                    }
                    stream?.use { output ->
                        writeBytesChunked(output, bytes)
                        true
                    } ?: false
                } catch (_: Exception) {
                    false
                }

                mainHandler.post {
                    if (!destroyed) {
                        if (wrote) {
                            showToast(activity.getString(R.string.export_saved, filename))
                        } else {
                            showToast(activity.getString(R.string.export_save_failed))
                        }
                    }
                }
            }
        } catch (_: RejectedExecutionException) {
            // Activity shutting down
        }
    }

    private fun shareViaFileProviderAsync(filename: String, mimeType: String, bytes: ByteArray) {
        if (destroyed || ioExecutor.isShutdown) return
        try {
            ioExecutor.execute {
                val contentUri = try {
                    val exportsDir = File(appContext.cacheDir, EXPORTS_CACHE_SUBDIR)
                    if (!exportsDir.exists()) {
                        exportsDir.mkdirs()
                    }
                    pruneStaleExports(exportsDir)

                    val slotDir = File(
                        exportsDir,
                        "${System.currentTimeMillis().toString(36)}_${shareSequence.incrementAndGet()}"
                    )
                    slotDir.mkdirs()
                    val outFile = File(slotDir, filename)
                    FileOutputStream(outFile, false).use { output ->
                        writeBytesChunked(output, bytes)
                    }
                    FileProvider.getUriForFile(
                        appContext,
                        "${appContext.packageName}.fileprovider",
                        outFile
                    )
                } catch (_: Exception) {
                    null
                }

                mainHandler.post {
                    if (destroyed || activity.isFinishing || activity.isDestroyed) return@post
                    if (contentUri == null) {
                        showToast(activity.getString(R.string.export_save_failed))
                        return@post
                    }

                    val sendIntent = Intent(Intent.ACTION_SEND).apply {
                        type = mimeType
                        putExtra(Intent.EXTRA_STREAM, contentUri)
                        putExtra(Intent.EXTRA_SUBJECT, filename)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    val chooser = Intent.createChooser(sendIntent, filename).apply {
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    try {
                        activity.startActivity(chooser)
                    } catch (_: ActivityNotFoundException) {
                        showToast(activity.getString(R.string.export_share_unavailable))
                    }
                }
            }
        } catch (_: RejectedExecutionException) {
            // Activity shutting down
        }
    }

    private fun writeBytesChunked(rawOut: OutputStream, bytes: ByteArray) {
        BufferedOutputStream(rawOut, STREAM_BUFFER_BYTES).use { out ->
            var offset = 0
            while (offset < bytes.size) {
                val chunkLen = minOf(STREAM_BUFFER_BYTES, bytes.size - offset)
                out.write(bytes, offset, chunkLen)
                offset += chunkLen
            }
            out.flush()
        }
    }

    /** Deletes staged export directories in `cacheDir/exports/` older than 1 hour (`EXPORT_CACHE_TTL_MS`). */
    private fun pruneStaleExports(exportsDir: File) {
        val cutoffMs = System.currentTimeMillis() - EXPORT_CACHE_TTL_MS
        val children = exportsDir.listFiles() ?: return
        for (child in children) {
            if (child.lastModified() < cutoffMs) {
                child.deleteRecursively()
            }
        }
    }

    /**
     * Converts HTML `<input accept="...">` extensions/MIME tokens into Android `DocumentsUI`
     * MIME filters. Falls back to `*/*` whenever custom data extensions (`.sqlite`, `.db`, `.tsv`,
     * `.json`, `.csv`, `.zip`) are included because many Android file providers classify them as
     * `application/octet-stream` and would otherwise gray them out.
     */
    private fun resolveAcceptMimeTypes(acceptTypes: Array<String>?): Array<String> {
        if (acceptTypes == null || acceptTypes.isEmpty()) {
            return DEFAULT_DOCUMENT_MIME_TYPES
        }

        val tokens = acceptTypes
            .flatMap { it.split(',') }
            .map { it.trim().lowercase(Locale.US) }
            .filter { it.isNotEmpty() }

        if (tokens.isEmpty()) {
            return DEFAULT_DOCUMENT_MIME_TYPES
        }

        val resolved = LinkedHashSet<String>()
        var includesCustomBinaryExt = false

        for (token in tokens) {
            when {
                token == "*/*" -> {
                    resolved.add("*/*")
                }
                token == "image/*" || token == ".png" || token == ".jpg" || token == ".jpeg" ||
                    token == ".webp" || token == ".gif" || token == ".avif" -> {
                    resolved.add("image/*")
                }
                token == ".zip" || token == "application/zip" || token == "application/x-zip-compressed" -> {
                    resolved.add("application/zip")
                    resolved.add("application/x-zip-compressed")
                    resolved.add("application/octet-stream")
                    includesCustomBinaryExt = true
                }
                token == ".json" || token == "application/json" -> {
                    resolved.add("application/json")
                    resolved.add("text/json")
                    resolved.add("text/plain")
                    includesCustomBinaryExt = true
                }
                token == ".csv" || token == "text/csv" -> {
                    resolved.add("text/csv")
                    resolved.add("text/comma-separated-values")
                    resolved.add("application/csv")
                    resolved.add("text/plain")
                    includesCustomBinaryExt = true
                }
                token == ".tsv" || token == "text/tab-separated-values" -> {
                    resolved.add("text/tab-separated-values")
                    resolved.add("text/plain")
                    includesCustomBinaryExt = true
                }
                token == ".htm" || token == ".html" || token == "text/html" -> {
                    resolved.add("text/html")
                }
                token == ".sqlite" || token == ".db" ||
                    token == "application/vnd.sqlite3" || token == "application/x-sqlite3" -> {
                    resolved.add("application/vnd.sqlite3")
                    resolved.add("application/x-sqlite3")
                    resolved.add("application/octet-stream")
                    includesCustomBinaryExt = true
                }
                token.contains('/') -> {
                    resolved.add(token)
                }
                token.startsWith('.') -> {
                    resolved.add("application/octet-stream")
                    includesCustomBinaryExt = true
                }
            }
        }

        if (resolved.isEmpty()) {
            return DEFAULT_DOCUMENT_MIME_TYPES
        }

        // Android's DocumentsUI often assigns generic MIME types to `.sqlite`, `.db`, `.tsv`, or
        // `.json` backups; fall back to `*/*` when those formats are accepted so files stay selectable.
        if (includesCustomBinaryExt || resolved.contains("*/*")) {
            return arrayOf("*/*")
        }

        return resolved.toTypedArray()
    }

    private fun sanitizeFilename(raw: String): String {
        val base = raw
            .replace('\\', '/')
            .substringAfterLast('/')
            .replace(Regex("[\\u0000-\\u001F<>:\"|?*]"), "_")
            .trim()
        if (base.isEmpty() || base == "." || base == "..") {
            return "pedigree-export.bin"
        }
        return base.take(128)
    }

    private fun sanitizeMimeType(raw: String): String {
        val cleaned = raw.substringBefore(';').trim().lowercase(Locale.US)
        if (cleaned.isEmpty() || !cleaned.contains('/')) {
            return "application/octet-stream"
        }
        return cleaned
    }

    private fun showToast(message: String) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
        } else {
            mainHandler.post {
                if (!destroyed) {
                    Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private enum class TransferMode {
        SAVE,
        SHARE
    }

    private data class PendingBinaryTransfer(
        val requestId: String,
        val filename: String,
        val mimeType: String,
        val mode: TransferMode,
        val expectedByteLength: Long
    )

    private data class PendingSavePayload(
        val filename: String,
        val bytes: ByteArray
    )

    private data class CreateDocumentRequest(
        val filename: String,
        val mimeType: String
    )

    private class CreateDocumentWithMimeContract :
        ActivityResultContract<CreateDocumentRequest, Uri?>() {
        override fun createIntent(context: Context, input: CreateDocumentRequest): Intent {
            return Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = input.mimeType
                putExtra(Intent.EXTRA_TITLE, input.filename)
            }
        }

        override fun parseResult(resultCode: Int, intent: Intent?): Uri? {
            return if (resultCode == Activity.RESULT_OK) intent?.data else null
        }
    }

    companion object {
        private const val EXPORTS_CACHE_SUBDIR = "exports"
        private const val EXPORT_CACHE_TTL_MS = 60L * 60L * 1000L
        private const val STREAM_BUFFER_BYTES = 16 * 1024

        private val DEFAULT_DOCUMENT_MIME_TYPES = arrayOf(
            "application/zip",
            "application/x-zip-compressed",
            "application/json",
            "text/csv",
            "text/comma-separated-values",
            "text/tab-separated-values",
            "text/html",
            "application/vnd.sqlite3",
            "application/x-sqlite3",
            "application/octet-stream",
            "text/plain",
            "image/*",
            "*/*"
        )
    }
}
