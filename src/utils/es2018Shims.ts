/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Minimal zero-dependency ES2018 runtime shims.
 * Targets 2018-era browsers (Chrome 68+, Safari 12+, Firefox 63+, Edge 79+ — and older where possible)
 * without core-js bloat:
 * - globalThis (ES2020)
 * - Promise.allSettled (ES2020)
 * - Object.fromEntries (ES2019)
 * - Blob.prototype.arrayBuffer / Blob.prototype.text (Chrome 76+ / Safari 14+ -> FileReader fallback)
 * - String.prototype.trimStart / trimEnd (Chrome 66+ / Safari 12+)
 */

type MarkedShimFn = ((...args: any[]) => any) & { __pedigreeEs2018Shim?: boolean };

export function isFileReaderSupported(): boolean {
  try {
    if (typeof FileReader !== 'function') return false;
    const probe = new FileReader();
    return Boolean(probe && typeof probe.readAsArrayBuffer === 'function');
  } catch {
    return false;
  }
}

/**
 * Reads any Blob/File into an ArrayBuffer safely across modern browsers (preferring native
 * `blob.arrayBuffer()`), legacy 2018 browsers (`FileReader`), and Safari Lockdown Mode (`Response`).
 */
export async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  const candidate = (blob as unknown as { arrayBuffer?: MarkedShimFn })?.arrayBuffer;
  if (typeof candidate === 'function' && !candidate.__pedigreeEs2018Shim) {
    try {
      return await Promise.resolve(candidate.call(blob));
    } catch {
      // Fall through cleanly if native method rejects or is blocked
    }
  }

  if (isFileReaderSupported()) {
    try {
      return await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
          } else {
            reject(new Error('FileReader did not return an ArrayBuffer.'));
          }
        };
        reader.onerror = () => {
          reject(reader.error || new Error('Failed to read binary file data.'));
        };
        reader.onabort = () => {
          reject(new Error('Binary file read was aborted.'));
        };
        reader.readAsArrayBuffer(blob);
      });
    } catch {
      // Fall through cleanly to Response fallback
    }
  }

  if (typeof Response === 'function') {
    try {
      return await new Response(blob).arrayBuffer();
    } catch {
      // Fall through to structured error below
    }
  }

  throw new Error('Blob binary reader is unavailable in this browser.');
}

/**
 * Reads any Blob/File as UTF-8 text safely, preferring native `blob.text()` first, then
 * `FileReader`, `Response`, and `TextDecoder` fallbacks.
 */
export async function readBlobAsText(blob: Blob): Promise<string> {
  const candidate = (blob as unknown as { text?: MarkedShimFn })?.text;
  if (typeof candidate === 'function' && !candidate.__pedigreeEs2018Shim) {
    try {
      return await Promise.resolve(candidate.call(blob));
    } catch {
      // Fall through cleanly if native method rejects or is blocked
    }
  }

  if (isFileReaderSupported()) {
    try {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve(typeof reader.result === 'string' ? reader.result : '');
        };
        reader.onerror = () => {
          reject(reader.error || new Error('Failed to read text file data.'));
        };
        reader.onabort = () => {
          reject(new Error('Text file read was aborted.'));
        };
        reader.readAsText(blob, 'utf-8');
      });
    } catch {
      // Fall through cleanly to Response / TextDecoder fallback
    }
  }

  if (typeof Response === 'function') {
    try {
      return await new Response(blob).text();
    } catch {
      // Fall through to ArrayBuffer decode fallback
    }
  }

  const buf = await readBlobAsArrayBuffer(blob);
  if (typeof TextDecoder === 'function') {
    return new TextDecoder('utf-8').decode(new Uint8Array(buf));
  }
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function defineNonEnumerableMethod(
  proto: Record<string, any> | undefined,
  methodName: string,
  fn: MarkedShimFn
): void {
  if (!proto || typeof proto[methodName] === 'function') return;
  try {
    Object.defineProperty(proto, methodName, {
      value: fn,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    try {
      proto[methodName] = fn;
    } catch {
      // Ignore frozen prototypes
    }
  }
}

export function ensureEs2018Globals(host?: Record<string, unknown>): void {
  const g: Record<string, any> | undefined =
    host ??
    (typeof globalThis !== 'undefined'
      ? (globalThis as Record<string, any>)
      : typeof window !== 'undefined'
      ? (window as Record<string, any>)
      : typeof self !== 'undefined'
      ? (self as Record<string, any>)
      : typeof global !== 'undefined'
      ? (global as Record<string, any>)
      : undefined);

  if (!g) return;

  if (typeof g.globalThis === 'undefined') {
    try {
      g.globalThis = g;
    } catch {
      // Ignore read-only global hosts
    }
  }

  const promiseObj = (g.Promise ?? (typeof Promise === 'function' ? Promise : undefined)) as
    | Record<string, any>
    | undefined;

  if (promiseObj && typeof promiseObj['allSettled'] !== 'function') {
    promiseObj['allSettled'] = function allSettledShim(values: Iterable<unknown>): Promise<unknown[]> {
      const items = Array.from(values);
      return promiseObj.all(
        items.map((item) =>
          promiseObj.resolve(item).then(
            (value: unknown) => ({ status: 'fulfilled' as const, value }),
            (reason: unknown) => ({ status: 'rejected' as const, reason })
          )
        )
      );
    };
  }

  const objectObj = (g.Object ?? Object) as Record<string, any>;
  if (objectObj && typeof objectObj['fromEntries'] !== 'function') {
    objectObj['fromEntries'] = function fromEntriesShim(
      entries: Iterable<readonly [PropertyKey, unknown]>
    ): Record<string, unknown> {
      const out: Record<string, unknown> = {};
      if (!entries) return out;
      for (const pair of entries) {
        if (pair != null) {
          out[String(pair[0])] = pair[1];
        }
      }
      return out;
    };
  }

  const blobCtor = (g.Blob ?? (typeof Blob === 'function' ? Blob : undefined)) as
    | { prototype?: Record<string, any> }
    | undefined;
  if (blobCtor?.prototype) {
    const arrayBufferShim: MarkedShimFn = function blobArrayBufferShim(this: Blob) {
      return readBlobAsArrayBuffer(this);
    };
    arrayBufferShim.__pedigreeEs2018Shim = true;
    defineNonEnumerableMethod(blobCtor.prototype, 'arrayBuffer', arrayBufferShim);

    const textShim: MarkedShimFn = function blobTextShim(this: Blob) {
      return readBlobAsText(this);
    };
    textShim.__pedigreeEs2018Shim = true;
    defineNonEnumerableMethod(blobCtor.prototype, 'text', textShim);
  }

  const stringCtor = (g.String ?? String) as { prototype?: Record<string, any> } | undefined;
  if (stringCtor?.prototype) {
    const trimStartShim: MarkedShimFn = function stringTrimStartShim(this: string) {
      return typeof (this as any).trimLeft === 'function'
        ? (this as any).trimLeft()
        : String(this).replace(/^[\s\uFEFF\xA0]+/, '');
    };
    defineNonEnumerableMethod(stringCtor.prototype, 'trimStart', trimStartShim);

    const trimEndShim: MarkedShimFn = function stringTrimEndShim(this: string) {
      return typeof (this as any).trimRight === 'function'
        ? (this as any).trimRight()
        : String(this).replace(/[\s\uFEFF\xA0]+$/, '');
    };
    defineNonEnumerableMethod(stringCtor.prototype, 'trimEnd', trimEndShim);
  }
}

ensureEs2018Globals();
