# Apple `WKWebView` Native SQLite Storage Contract

## 1. Why Native SQLite Routing Is Mandatory on Apple Platforms
Apple `WebKit` (`WKWebView` / Safari / Home Screen PWA) enforces Intelligent Tracking Prevention (ITP) and memory/disk pressure purges that automatically evict browser-managed `IndexedDB`, `localStorage`, and Cache Storage after 7 days of inactivity.

To guarantee permanent offline durability, `@engine/storage/resilientStorageAdapter.ts` and the host application wiring detect `shell === 'ios-wkwebview'` (`requiresIosStorageBridge === true`) and route persistence through `NativeBridgeStorageAdapter` instead of evictable WebKit storage.

## 2. Native Sandbox Location
- **iOS / iPadOS:** `FileManager.SearchPathDirectory.applicationSupportDirectory` (or `documentDirectory` when user-visible Files app access is desired), excluded from volatile `Caches/`.
- **macOS:** `~/Library/Application Support/<BundleIdentifier>/storage.sqlite`.

## 3. Recommended Native Key-Value Table Schema
```sql
CREATE TABLE IF NOT EXISTS native_kv_store (
  key TEXT PRIMARY KEY NOT NULL,
  value_text TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_native_kv_prefix ON native_kv_store(key);
```

## 4. Operation Semantics
- `read(key)`: Returns `value_text` (`String`) or `null` if absent.
- `write(key, data)`: Atomic `INSERT ... ON CONFLICT(key) DO UPDATE` inside a short SQLite WAL transaction (`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;`).
- `delete(key)`: `DELETE FROM native_kv_store WHERE key = ?`.
- `list(options.prefix)`: `SELECT key FROM native_kv_store WHERE key LIKE ? ESCAPE '\' ORDER BY key ASC`.
- `vaultSnapshot(key, data)`: Writes an atomic timestamped snapshot file into `<ApplicationSupport>/vault/` via temp-file + `replaceItemAt`.
