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
 * - Array.prototype.flat / flatMap (ES2019 — Chrome 69+ -> Android 8 Chromium 61–68 fallback)
 * - Blob.prototype.arrayBuffer / Blob.prototype.text (Chrome 76+ / Safari 14+ -> FileReader fallback)
 * - String.prototype.trimStart / trimEnd (Chrome 66+ / Safari 12+)
 */

type MarkedShimFn = ((...args: unknown[]) => unknown) & { __coreEs2018Shim?: boolean };

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
  if (typeof candidate === 'function' && !candidate.__coreEs2018Shim) {
    try {
      return await Promise.resolve(candidate.call(blob) as PromiseLike<ArrayBuffer> | ArrayBuffer);
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
  if (typeof candidate === 'function' && !candidate.__coreEs2018Shim) {
    try {
      return await Promise.resolve(candidate.call(blob) as PromiseLike<string> | string);
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
  proto: Record<string, unknown> | object | undefined,
  methodName: string,
  fn: MarkedShimFn
): void {
  if (!proto) return;
  const record = proto as Record<string, unknown>;
  if (typeof record[methodName] === 'function') return;
  try {
    Object.defineProperty(proto, methodName, {
      value: fn,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  } catch {
    try {
      record[methodName] = fn;
    } catch {
      // Ignore frozen prototypes
    }
  }
}

declare const global: Record<string, unknown> | undefined;

export function ensureEs2018Globals(host?: Record<string, unknown>): void {
  const g: Record<string, unknown> | undefined =
    host ??
    (typeof globalThis !== 'undefined'
      ? (globalThis as unknown as Record<string, unknown>)
      : typeof window !== 'undefined'
      ? (window as unknown as Record<string, unknown>)
      : typeof self !== 'undefined'
      ? (self as unknown as Record<string, unknown>)
      : typeof global !== 'undefined'
      ? global
      : undefined);

  if (!g) return;

  if (typeof g.globalThis === 'undefined') {
    try {
      g.globalThis = g;
    } catch {
      // Ignore read-only global hosts
    }
  }

  interface PromiseShimHost {
    all: (values: Iterable<unknown>) => Promise<unknown[]>;
    resolve: (value: unknown) => Promise<unknown>;
    allSettled?: (values: Iterable<unknown>) => Promise<unknown[]>;
  }

  const promiseObj = (g.Promise ?? (typeof Promise === 'function' ? Promise : undefined)) as
    | PromiseShimHost
    | undefined;

  if (promiseObj && typeof promiseObj.allSettled !== 'function') {
    try {
      promiseObj.allSettled = function allSettledShim(values: Iterable<unknown>): Promise<unknown[]> {
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
    } catch {
      // Ignore read-only Promise hosts
    }
  }

  const objectObj = (g.Object ?? Object) as unknown as Record<string, unknown>;
  if (objectObj && typeof objectObj['fromEntries'] !== 'function') {
    try {
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
    } catch {
      // Ignore read-only Object hosts
    }
  }

  const blobCtor = (g.Blob ?? (typeof Blob === 'function' ? Blob : undefined)) as
    | { prototype?: Record<string, unknown> }
    | undefined;
  if (blobCtor?.prototype) {
    const arrayBufferShim: MarkedShimFn = function blobArrayBufferShim(this: Blob) {
      return readBlobAsArrayBuffer(this);
    };
    arrayBufferShim.__coreEs2018Shim = true;
    defineNonEnumerableMethod(blobCtor.prototype, 'arrayBuffer', arrayBufferShim);

    const textShim: MarkedShimFn = function blobTextShim(this: Blob) {
      return readBlobAsText(this);
    };
    textShim.__coreEs2018Shim = true;
    defineNonEnumerableMethod(blobCtor.prototype, 'text', textShim);
  }

  const stringCtor = (g.String ?? String) as { prototype?: object } | undefined;
  if (stringCtor?.prototype) {
    interface LegacyTrimString {
      trimLeft?: () => string;
      trimRight?: () => string;
    }

    const trimStartShim: MarkedShimFn = function stringTrimStartShim(this: string) {
      const legacy = this as unknown as LegacyTrimString;
      return typeof legacy.trimLeft === 'function'
        ? legacy.trimLeft.call(this)
        : String(this).replace(/^[\s\uFEFF\xA0]+/, '');
    };
    defineNonEnumerableMethod(stringCtor.prototype, 'trimStart', trimStartShim);

    const trimEndShim: MarkedShimFn = function stringTrimEndShim(this: string) {
      const legacy = this as unknown as LegacyTrimString;
      return typeof legacy.trimRight === 'function'
        ? legacy.trimRight.call(this)
        : String(this).replace(/[\s\uFEFF\xA0]+$/, '');
    };
    defineNonEnumerableMethod(stringCtor.prototype, 'trimEnd', trimEndShim);
  }

  const arrayCtor = (g.Array ?? Array) as { prototype?: Record<string, unknown> } | undefined;
  if (arrayCtor?.prototype) {
    const flatShim: MarkedShimFn = function arrayFlatShim(this: unknown[], ...args: unknown[]): unknown[] {
      const depth = args[0];
      const targetDepth = typeof depth === 'number' && Number.isFinite(depth) ? Math.floor(depth) : 1;
      function flatten(arr: unknown[], d: number): unknown[] {
        const out: unknown[] = [];
        for (let i = 0; i < arr.length; i += 1) {
          if (Object.prototype.hasOwnProperty.call(arr, i)) {
            const item = arr[i];
            if (Array.isArray(item) && d > 0) {
              out.push(...flatten(item, d - 1));
            } else {
              out.push(item);
            }
          }
        }
        return out;
      }
      return flatten(this, targetDepth);
    };
    flatShim.__coreEs2018Shim = true;
    defineNonEnumerableMethod(arrayCtor.prototype, 'flat', flatShim);

    const flatMapShim: MarkedShimFn = function arrayFlatMapShim(this: unknown[], ...args: unknown[]): unknown[] {
      const callback = args[0];
      const thisArg = args[1];
      if (typeof callback !== 'function') {
        throw new TypeError('Array.prototype.flatMap callback must be a function');
      }
      const cb = callback as (value: unknown, index: number, array: unknown[]) => unknown;
      const out: unknown[] = [];
      for (let i = 0; i < this.length; i += 1) {
        if (Object.prototype.hasOwnProperty.call(this, i)) {
          const mapped = cb.call(thisArg, this[i], i, this);
          if (Array.isArray(mapped)) {
            out.push(...mapped);
          } else {
            out.push(mapped);
          }
        }
      }
      return out;
    };
    flatMapShim.__coreEs2018Shim = true;
    defineNonEnumerableMethod(arrayCtor.prototype, 'flatMap', flatMapShim);

    const arrayAtShim: MarkedShimFn = function arrayAtShim(this: unknown[], ...args: unknown[]): unknown {
      const len = this.length >>> 0;
      const raw = Number(args[0]);
      const relativeIndex = Number.isNaN(raw) ? 0 : Math.trunc(raw);
      const k = relativeIndex >= 0 ? relativeIndex : len + relativeIndex;
      if (k < 0 || k >= len) return undefined;
      return this[k];
    };
    arrayAtShim.__coreEs2018Shim = true;
    defineNonEnumerableMethod(arrayCtor.prototype, 'at', arrayAtShim);
  }

  if (typeof g.queueMicrotask !== 'function') {
    const queueMicrotaskShim: MarkedShimFn = function queueMicrotaskShim(cb: unknown): void {
      if (typeof cb !== 'function') {
        throw new TypeError('queueMicrotask callback must be a function');
      }
      const fn = cb as () => void;
      if (promiseObj && typeof promiseObj.resolve === 'function') {
        promiseObj.resolve(undefined).then(fn, (err: unknown) => {
          setTimeout(() => {
            throw err;
          }, 0);
        });
      } else {
        setTimeout(fn, 0);
      }
    };
    queueMicrotaskShim.__coreEs2018Shim = true;
    try {
      g.queueMicrotask = queueMicrotaskShim;
    } catch {
      // Ignore read-only global hosts
    }
  }

  if (objectObj && typeof objectObj['hasOwn'] !== 'function') {
    const hasOwnShim: MarkedShimFn = function objectHasOwnShim(
      obj: unknown,
      prop: unknown
    ): boolean {
      if (obj == null) {
        throw new TypeError('Cannot convert undefined or null to object');
      }
      return Object.prototype.hasOwnProperty.call(Object(obj), prop as PropertyKey);
    };
    hasOwnShim.__coreEs2018Shim = true;
    try {
      objectObj['hasOwn'] = hasOwnShim;
    } catch {
      // Ignore read-only Object hosts
    }
  }

  if (stringCtor?.prototype) {
    const replaceAllShim: MarkedShimFn = function stringReplaceAllShim(
      this: string,
      ...args: unknown[]
    ): string {
      const searchValue = args[0];
      const replaceValue = args[1];
      const str = String(this);
      if (searchValue instanceof RegExp) {
        if (!searchValue.global) {
          throw new TypeError('String.prototype.replaceAll called with a non-global RegExp argument');
        }
        return str.replace(searchValue, replaceValue as string);
      }
      const searchStr = String(searchValue);
      if (typeof replaceValue === 'function') {
        const replacer = replaceValue as (match: string, offset: number, full: string) => string;
        if (searchStr === '') {
          let result = '';
          for (let i = 0; i <= str.length; i += 1) {
            result += String(replacer('', i, str));
            if (i < str.length) result += str[i];
          }
          return result;
        }
        let result = '';
        let pos = 0;
        let idx = str.indexOf(searchStr, pos);
        while (idx !== -1) {
          result += str.slice(pos, idx) + String(replacer(searchStr, idx, str));
          pos = idx + searchStr.length;
          idx = str.indexOf(searchStr, pos);
        }
        return result + str.slice(pos);
      }
      const replaceStr = String(replaceValue);
      if (searchStr === '') {
        return replaceStr + str.split('').join(replaceStr) + replaceStr;
      }
      return str.split(searchStr).join(replaceStr);
    };
    replaceAllShim.__coreEs2018Shim = true;
    defineNonEnumerableMethod(stringCtor.prototype, 'replaceAll', replaceAllShim);

    const stringAtShim: MarkedShimFn = function stringAtShim(this: string, ...args: unknown[]): string | undefined {
      const str = String(this);
      const raw = Number(args[0]);
      const relativeIndex = Number.isNaN(raw) ? 0 : Math.trunc(raw);
      const k = relativeIndex >= 0 ? relativeIndex : str.length + relativeIndex;
      if (k < 0 || k >= str.length) return undefined;
      return str.charAt(k);
    };
    stringAtShim.__coreEs2018Shim = true;
    defineNonEnumerableMethod(stringCtor.prototype, 'at', stringAtShim);
  }
}

ensureEs2018Globals();
