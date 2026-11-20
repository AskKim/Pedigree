/*
 * Community Pedigree Android Wrapper
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

package org.askkim.pedigree.wrapper

import android.content.Context
import android.util.Base64
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.file.Files
import java.security.MessageDigest
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.atomic.AtomicLong

/**
 * Mirrors `SYNC_BACKUP_SNAPSHOT` payloads into `filesDir/pedigree-vault/` on a single serial
 * background executor using 16 KiB streaming I/O, SHA-256 deduplication, atomic `.tmp` rename,
 * and 5-snapshot rotation.
 *
 * Why keep a native vault outside `app_webview/`?
 * Chromium WebView storage (`IndexedDB` / `OPFS`) lives inside `app_webview/` and can be
 * affected by WebView upgrades or browser quota eviction. Mirroring verified snapshots into
 * `Context.filesDir/pedigree-vault/` provides an independent safety net inside the app's private
 * sandbox without ever reading or modifying `app_webview/` beyond read-only size accounting.
 */
class NativeBackupVault(
    context: Context,
    private val diagnosticBuffer: DiagnosticRingBuffer
) {
    data class VaultState(
        val snapshotCount: Int,
        val totalBytes: Long,
        val latestTimestampIso: String?,
        val latestDigestHex: String?,
        val latestByteLength: Long
    )

    private data class PendingSnapshotHeader(
        val requestId: String,
        val snapshotId: String,
        val createdAtIso: String,
        val extension: String,
        val expectedByteLength: Long,
        val rejectOversized: Boolean
    )

    private data class QueuedSnapshotWrite(
        val header: PendingSnapshotHeader,
        val bytes: ByteArray
    )

    private val appContext: Context = context.applicationContext
    private val ioExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private val sequence = AtomicLong(0L)
    private val pendingWriteLock = Any()
    private var latestQueuedWrite: QueuedSnapshotWrite? = null
    private var drainScheduled = false

    private var pendingHeader: PendingSnapshotHeader? = null

    @Volatile
    private var destroyed = false

    @Volatile
    private var cachedState = VaultState(
        snapshotCount = 0,
        totalBytes = 0L,
        latestTimestampIso = null,
        latestDigestHex = null,
        latestByteLength = -1L
    )

    @Volatile
    private var cachedAppWebViewBytes: Long = -1L

    init {
        try {
            ioExecutor.execute {
                if (!destroyed) {
                    initializeVaultStateBlocking()
                    cachedAppWebViewBytes = measureAppWebViewBytesBlocking()
                }
            }
        } catch (_: RejectedExecutionException) {
            // Ignore during teardown
        }
    }

    /**
     * Parses `SYNC_BACKUP_SNAPSHOT` header metadata.
     * Returns `true` if a trailing `TYPE_ARRAY_BUFFER` frame is expected next.
     */
    fun beginSnapshotSync(requestId: String, payload: JSONObject?): Boolean {
        if (destroyed || payload == null) {
            pendingHeader = null
            return false
        }

        val rawId = if (payload.isNull("snapshotId")) "" else payload.optString("snapshotId", "")
        val snapshotId = sanitizeSnapshotId(rawId)
        val createdAtIso = if (payload.isNull("createdAt")) "" else payload.optString("createdAt", "").trim().take(64)
        val format = if (payload.isNull("format")) "bin" else payload.optString("format", "bin")
        val extension = sanitizeFormatExtension(format)
        val expectedByteLength = payload.optLong("byteLength", -1L)

        // Optional inline base64 fallback
        val inlineBase64 = if (payload.isNull("base64Data")) "" else payload.optString("base64Data", "")
        if (inlineBase64.isNotEmpty()) {
            pendingHeader = null
            val decoded = try {
                Base64.decode(inlineBase64, Base64.DEFAULT)
            } catch (_: IllegalArgumentException) {
                diagnosticBuffer.record(
                    DiagnosticRingBuffer.LEVEL_WARN,
                    "VAULT_BASE64_INVALID",
                    "Ignored invalid base64 snapshot $snapshotId"
                )
                return false
            }
            val header = PendingSnapshotHeader(
                requestId = requestId,
                snapshotId = snapshotId,
                createdAtIso = createdAtIso,
                extension = extension,
                expectedByteLength = expectedByteLength,
                rejectOversized = expectedByteLength > MAX_SNAPSHOT_BYTES
            )
            enqueueSnapshotBytes(header, decoded)
            return false
        }

        pendingHeader = PendingSnapshotHeader(
            requestId = requestId,
            snapshotId = snapshotId,
            createdAtIso = createdAtIso,
            extension = extension,
            expectedByteLength = expectedByteLength,
            rejectOversized = expectedByteLength > MAX_SNAPSHOT_BYTES
        )
        return true
    }

    /** Cancels any staged header awaiting a trailing binary frame. */
    fun clearPendingSnapshot() {
        pendingHeader = null
    }

    /** Receives the trailing `TYPE_ARRAY_BUFFER` frame paired with [pendingHeader] and queues it for disk write. */
    fun handleIncomingSnapshotBytes(bytes: ByteArray) {
        val header = pendingHeader
        pendingHeader = null
        if (destroyed || header == null) return

        enqueueSnapshotBytes(header, bytes)
    }

    /** Returns the latest cached vault summary in O(1) without blocking the UI or bridge thread. */
    fun getVaultInfo(): VaultState = cachedState

    /** Returns the most recently measured `app_webview` directory size in bytes (`-1` if not yet measured). */
    fun getAppWebViewBytes(): Long = cachedAppWebViewBytes

    /** Returns the absolute path to `filesDir/pedigree-vault/`. */
    fun getVaultDirectoryPath(): String = File(appContext.filesDir, VAULT_DIR_NAME).absolutePath

    /** Re-scans `pedigree-vault/` and measures `app_webview/` read-only on the background executor. */
    fun refreshStorageMetricsAsync(onComplete: (VaultState, Long) -> Unit) {
        if (destroyed || ioExecutor.isShutdown) return
        try {
            ioExecutor.execute {
                if (destroyed) return@execute
                val vaultState = scanVaultDirectoryBlocking(computeLatestDigest = false)
                cachedState = vaultState
                val webViewBytes = measureAppWebViewBytesBlocking()
                cachedAppWebViewBytes = webViewBytes
                if (!destroyed) {
                    onComplete(vaultState, webViewBytes)
                }
            }
        } catch (_: RejectedExecutionException) {
            // Shutting down
        }
    }

    /** Clears pending writes and shuts down the background I/O executor on Activity destroy. */
    fun destroy() {
        destroyed = true
        pendingHeader = null
        synchronized(pendingWriteLock) {
            latestQueuedWrite = null
            drainScheduled = false
        }
        ioExecutor.shutdown()
    }

    private fun enqueueSnapshotBytes(header: PendingSnapshotHeader, bytes: ByteArray) {
        if (header.rejectOversized || bytes.size.toLong() > MAX_SNAPSHOT_BYTES) {
            val reportedSize = maxOf(header.expectedByteLength, bytes.size.toLong())
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "VAULT_SNAPSHOT_TOO_LARGE",
                "Dropped snapshot ${header.snapshotId} ($reportedSize B > 16 MiB cap)"
            )
            return
        }

        if (bytes.isEmpty()) {
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "VAULT_SNAPSHOT_EMPTY",
                "Ignored empty snapshot ${header.snapshotId}"
            )
            return
        }

        if (header.expectedByteLength >= 0L && bytes.size.toLong() != header.expectedByteLength) {
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_WARN,
                "VAULT_LENGTH_MISMATCH",
                "Snapshot ${header.snapshotId} expected ${header.expectedByteLength} B, got ${bytes.size} B"
            )
            return
        }

        if (destroyed || ioExecutor.isShutdown) return

        // Conflate rapid sync bursts to a single pending slot so queued snapshot RAM stays <= 16 MiB.
        val shouldScheduleDrain: Boolean
        synchronized(pendingWriteLock) {
            latestQueuedWrite = QueuedSnapshotWrite(header, bytes)
            shouldScheduleDrain = !drainScheduled
            if (shouldScheduleDrain) {
                drainScheduled = true
            }
        }

        if (!shouldScheduleDrain) return

        try {
            ioExecutor.execute {
                drainPendingWritesBlocking()
            }
        } catch (_: RejectedExecutionException) {
            synchronized(pendingWriteLock) {
                latestQueuedWrite = null
                drainScheduled = false
            }
        }
    }

    private fun drainPendingWritesBlocking() {
        while (!destroyed) {
            val nextWrite: QueuedSnapshotWrite?
            synchronized(pendingWriteLock) {
                nextWrite = latestQueuedWrite
                latestQueuedWrite = null
                if (nextWrite == null) {
                    drainScheduled = false
                    return
                }
            }
            persistSnapshotBlocking(nextWrite.header, nextWrite.bytes)
        }
        synchronized(pendingWriteLock) {
            latestQueuedWrite = null
            drainScheduled = false
        }
    }

    private fun initializeVaultStateBlocking() {
        val vaultDir = File(appContext.filesDir, VAULT_DIR_NAME)
        if (vaultDir.exists()) {
            vaultDir.listFiles()?.forEach { file ->
                if (file.isFile && file.name.endsWith(TMP_SUFFIX)) {
                    file.delete()
                }
            }
        }
        cachedState = scanVaultDirectoryBlocking(computeLatestDigest = true)
    }

    /**
     * Streams one snapshot to `.tmp`, deduplicates by SHA-256 + byte length against the latest
     * stored snapshot (skipping redundant flash writes), atomically renames on change, and rotates
     * to keep at most [MAX_RETAINED_SNAPSHOTS] (5) files.
     */
    private fun persistSnapshotBlocking(header: PendingSnapshotHeader, bytes: ByteArray) {
        val vaultDir = File(appContext.filesDir, VAULT_DIR_NAME)
        if (!vaultDir.exists() && !vaultDir.mkdirs()) {
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_ERROR,
                "VAULT_MKDIR_FAILED",
                "Could not create native backup vault directory"
            )
            return
        }

        val current = cachedState
        if (current.latestDigestHex != null && current.latestByteLength == bytes.size.toLong()) {
            val preDigestHex = computeBytesSha256InChunks(bytes)
            if (preDigestHex == current.latestDigestHex) {
                diagnosticBuffer.record(
                    DiagnosticRingBuffer.LEVEL_INFO,
                    "VAULT_SYNC_DEDUP",
                    "Skipped unchanged snapshot ${header.snapshotId} (${bytes.size} B)"
                )
                return
            }
        }

        val nowMs = System.currentTimeMillis()
        val seq = sequence.incrementAndGet() % 10000L
        val prefix = String.format(Locale.US, "%013d_%04d_%s", nowMs, seq, header.snapshotId)
        val tmpFile = File(vaultDir, "$prefix$TMP_SUFFIX")

        val digestHex = try {
            val digest = MessageDigest.getInstance("SHA-256")
            BufferedOutputStream(FileOutputStream(tmpFile, false), STREAM_BUFFER_BYTES).use { out ->
                var offset = 0
                while (offset < bytes.size) {
                    val chunkLen = minOf(STREAM_BUFFER_BYTES, bytes.size - offset)
                    out.write(bytes, offset, chunkLen)
                    digest.update(bytes, offset, chunkLen)
                    offset += chunkLen
                }
                out.flush()
            }
            digest.digest().toHexStringLower()
        } catch (err: Exception) {
            tmpFile.delete()
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_ERROR,
                "VAULT_WRITE_FAILED",
                "Failed writing vault temp file: ${err.message ?: err.javaClass.simpleName}"
            )
            return
        }

        val finalFile = File(vaultDir, "$prefix.${header.extension}")
        if (!tmpFile.renameTo(finalFile)) {
            tmpFile.delete()
            diagnosticBuffer.record(
                DiagnosticRingBuffer.LEVEL_ERROR,
                "VAULT_COMMIT_FAILED",
                "Atomic rename failed for ${finalFile.name}"
            )
            return
        }

        val retained = rotateSnapshotsBlocking(vaultDir)
        val totalBytes = retained.sumOf { it.length() }
        val latestTimestampIso = header.createdAtIso.ifEmpty {
            DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(nowMs))
        }
        cachedState = VaultState(
            snapshotCount = retained.size,
            totalBytes = totalBytes,
            latestTimestampIso = latestTimestampIso,
            latestDigestHex = digestHex,
            latestByteLength = bytes.size.toLong()
        )
        diagnosticBuffer.record(
            DiagnosticRingBuffer.LEVEL_INFO,
            "VAULT_SYNC_SAVED",
            "Mirrored ${finalFile.name} (${bytes.size} B; ${retained.size}/$MAX_RETAINED_SNAPSHOTS kept)"
        )
    }

    private fun rotateSnapshotsBlocking(vaultDir: File): List<File> {
        val files = vaultDir.listFiles()
            ?.filter { it.isFile && !it.name.endsWith(TMP_SUFFIX) }
            ?.sortedByDescending { it.name }
            ?: emptyList()

        if (files.size > MAX_RETAINED_SNAPSHOTS) {
            for (i in MAX_RETAINED_SNAPSHOTS until files.size) {
                files[i].delete()
            }
            return files.take(MAX_RETAINED_SNAPSHOTS)
        }
        return files
    }

    private fun scanVaultDirectoryBlocking(computeLatestDigest: Boolean): VaultState {
        val vaultDir = File(appContext.filesDir, VAULT_DIR_NAME)
        if (!vaultDir.exists()) {
            return VaultState(0, 0L, null, null, -1L)
        }

        val retained = rotateSnapshotsBlocking(vaultDir)
        if (retained.isEmpty()) {
            return VaultState(0, 0L, null, null, -1L)
        }

        val newest = retained.first()
        val totalBytes = retained.sumOf { it.length() }
        val newestTimestampMs = parseTimestampPrefixMs(newest.name) ?: newest.lastModified()
        val latestIso = if (newestTimestampMs > 0L) {
            DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(newestTimestampMs))
        } else {
            null
        }

        val existing = cachedState
        val digestHex = if (computeLatestDigest) {
            computeFileSha256Blocking(newest)
        } else {
            existing.latestDigestHex
        }
        val latestByteLen = if (computeLatestDigest) {
            newest.length()
        } else if (existing.latestByteLength >= 0L) {
            existing.latestByteLength
        } else {
            newest.length()
        }

        val resolvedTimestampIso = if (
            existing.latestDigestHex != null &&
            existing.latestDigestHex == digestHex &&
            existing.latestTimestampIso != null
        ) {
            existing.latestTimestampIso
        } else {
            latestIso ?: existing.latestTimestampIso
        }

        return VaultState(
            snapshotCount = retained.size,
            totalBytes = totalBytes,
            latestTimestampIso = resolvedTimestampIso,
            latestDigestHex = digestHex,
            latestByteLength = latestByteLen
        )
    }

    private fun computeFileSha256Blocking(file: File): String? {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(STREAM_BUFFER_BYTES)
            BufferedInputStream(FileInputStream(file), STREAM_BUFFER_BYTES).use { input ->
                while (true) {
                    val read = input.read(buffer)
                    if (read <= 0) break
                    digest.update(buffer, 0, read)
                }
            }
            digest.digest().toHexStringLower()
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Walks `dataDir/app_webview` strictly read-only (skipping symlinks) to report WebView
     * disk consumption in the Storage Truth Card. Never opens, modifies, or deletes WebView files.
     */
    private fun measureAppWebViewBytesBlocking(): Long {
        val appWebViewDir = File(appContext.dataDir, APP_WEBVIEW_DIR_NAME)
        if (!appWebViewDir.exists()) return 0L
        return computeDirectoryBytesReadOnly(appWebViewDir)
    }

    private fun computeDirectoryBytesReadOnly(root: File): Long {
        var total = 0L
        val stack = ArrayDeque<File>()
        stack.addLast(root)
        while (stack.isNotEmpty()) {
            val current = stack.removeLast()
            val path = try {
                current.toPath()
            } catch (_: Exception) {
                continue
            }
            if (Files.isSymbolicLink(path)) continue
            if (current.isFile) {
                total += current.length()
            } else if (current.isDirectory) {
                val children = current.listFiles() ?: continue
                for (child in children) {
                    stack.addLast(child)
                }
            }
        }
        return total
    }

    private fun parseTimestampPrefixMs(filename: String): Long? {
        val prefix = filename.substringBefore('_')
        return prefix.toLongOrNull()
    }

    private fun computeBytesSha256InChunks(bytes: ByteArray): String? {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            var offset = 0
            while (offset < bytes.size) {
                val chunkLen = minOf(STREAM_BUFFER_BYTES, bytes.size - offset)
                digest.update(bytes, offset, chunkLen)
                offset += chunkLen
            }
            digest.digest().toHexStringLower()
        } catch (_: Exception) {
            null
        }
    }

    private fun sanitizeSnapshotId(raw: String): String {
        val cleaned = raw.trim().replace(UNSAFE_ID_REGEX, "_")
        if (cleaned.isEmpty()) return "snap"
        return cleaned.take(48)
    }

    private fun sanitizeFormatExtension(rawFormat: String): String {
        return when (rawFormat.trim().lowercase(Locale.US)) {
            "json" -> "json"
            "sqlite" -> "sqlite"
            "zip" -> "zip"
            else -> "bin"
        }
    }

    private fun ByteArray.toHexStringLower(): String {
        val chars = CharArray(size * 2)
        val hex = "0123456789abcdef"
        for (i in indices) {
            val v = this[i].toInt() and 0xFF
            chars[i * 2] = hex[v ushr 4]
            chars[i * 2 + 1] = hex[v and 0x0F]
        }
        return String(chars)
    }

    companion object {
        const val VAULT_DIR_NAME = "pedigree-vault"
        private const val APP_WEBVIEW_DIR_NAME = "app_webview"
        private const val TMP_SUFFIX = ".tmp"
        private const val MAX_RETAINED_SNAPSHOTS = 5
        private const val STREAM_BUFFER_BYTES = 16 * 1024
        const val MAX_SNAPSHOT_BYTES = 16L * 1024L * 1024L
        private val UNSAFE_ID_REGEX = Regex("[^A-Za-z0-9_-]")
    }
}
