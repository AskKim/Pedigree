/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatPrintPreviewFileError,
  isPrintPreviewAbortError,
  runPrintPreviewFileAction,
} from '../../components/PrintPreviewModal';
import {
  getActiveAsyncErrorToasts,
  resetAsyncErrorToastsForTests,
} from '../../storage/crashLogger';

describe('PrintPreviewModal .HTM download & share error surfacing', () => {
  beforeEach(() => {
    resetAsyncErrorToastsForTests();
  });

  it('detects AbortError cancellations cleanly without flagging real failures', () => {
    const abortErr = new Error('User cancelled share');
    abortErr.name = 'AbortError';
    expect(isPrintPreviewAbortError(abortErr)).toBe(true);
    expect(isPrintPreviewAbortError({ name: 'AbortError' })).toBe(true);
    expect(isPrintPreviewAbortError(new Error('Disk full'))).toBe(false);
    expect(isPrintPreviewAbortError(null)).toBe(false);
  });

  it('formats distinct user-facing download and share error notices', () => {
    const dl = formatPrintPreviewFileError(
      'download',
      'clover-pedigree.htm',
      new Error('QuotaExceededError')
    );
    expect(dl.action).toBe('download');
    expect(dl.title).toBe('Could Not Download .HTM File');
    expect(dl.detail).toContain('clover-pedigree.htm');
    expect(dl.detail).toContain('QuotaExceededError');
    expect(dl.detail).toContain('Print / Save PDF');

    const sh = formatPrintPreviewFileError('share', '   ', 'Share target rejected file');
    expect(sh.action).toBe('share');
    expect(sh.title).toBe('Could Not Share .HTM File');
    expect(sh.detail).toContain('document.htm');
    expect(sh.detail).toContain('Share target rejected file');
    expect(sh.detail).toContain('Download .HTM');

    const pdfErr = formatPrintPreviewFileError('pdf', 'clover.pdf', new Error('Canvas failed'));
    expect(pdfErr.action).toBe('pdf');
    expect(pdfErr.title).toBe('Could Not Export .PDF File');
    expect(pdfErr.detail).toContain('clover.pdf');
    expect(pdfErr.detail).toContain('Canvas failed');
  });

  it('surfaces download failure via inline callback and global toast while cleaning up busy state', async () => {
    const onBeforeStart = vi.fn();
    const onError = vi.fn();
    const onFinish = vi.fn();

    const ok = await runPrintPreviewFileAction({
      action: 'download',
      filename: 'buck-pedigree.htm',
      task: async () => {
        throw new Error('Native export failed');
      },
      isMounted: () => true,
      onBeforeStart,
      onError,
      onFinish,
    });

    expect(ok).toBe(false);
    expect(onBeforeStart).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    const [errPayload, toastId] = onError.mock.calls[0];
    expect(errPayload.action).toBe('download');
    expect(errPayload.title).toBe('Could Not Download .HTM File');
    expect(errPayload.detail).toContain('Native export failed');
    expect(typeof toastId).toBe('string');

    const toasts = getActiveAsyncErrorToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(toastId);
    expect(toasts[0].severity).toBe('error');
    expect(toasts[0].sticky).toBe(true);
  });

  it('surfaces Web Share failure with memory-like classification when QuotaExceeded occurs', async () => {
    const onError = vi.fn();
    const onFinish = vi.fn();
    const quotaErr = new Error('NS_ERROR_DOM_QUOTA_REACHED');
    quotaErr.name = 'QuotaExceededError';

    const ok = await runPrintPreviewFileAction({
      action: 'share',
      filename: 'barn-binder.htm',
      task: async () => {
        throw quotaErr;
      },
      isMounted: () => true,
      onBeforeStart: () => {},
      onError,
      onFinish,
    });

    expect(ok).toBe(false);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    const toasts = getActiveAsyncErrorToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('Could Not Share .HTM File');
    expect(toasts[0].category).toBe('memory');
  });

  it('suppresses AbortError user cancellations without emitting errors or toasts', async () => {
    const onError = vi.fn();
    const onFinish = vi.fn();
    const abortErr = new Error('Share sheet dismissed');
    abortErr.name = 'AbortError';

    const ok = await runPrintPreviewFileAction({
      action: 'share',
      filename: 'clover-pedigree.htm',
      task: async () => {
        throw abortErr;
      },
      isMounted: () => true,
      onBeforeStart: () => {},
      onError,
      onFinish,
    });

    expect(ok).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(getActiveAsyncErrorToasts()).toHaveLength(0);
  });

  it('skips modal state callback when unmounted while still emitting global toast', async () => {
    const onError = vi.fn();
    const onFinish = vi.fn();

    const ok = await runPrintPreviewFileAction({
      action: 'download',
      filename: 'late-failure.htm',
      task: async () => {
        throw new Error('Write failed after modal closed');
      },
      isMounted: () => false,
      onBeforeStart: () => {},
      onError,
      onFinish,
    });

    expect(ok).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(getActiveAsyncErrorToasts()).toHaveLength(1);
  });

  it('returns true and leaves zero error notices on success', async () => {
    const onError = vi.fn();
    const onFinish = vi.fn();

    const ok = await runPrintPreviewFileAction({
      action: 'download',
      filename: 'clover-pedigree.htm',
      task: async () => undefined,
      isMounted: () => true,
      onBeforeStart: () => {},
      onError,
      onFinish,
    });

    expect(ok).toBe(true);
    expect(onError).not.toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(getActiveAsyncErrorToasts()).toHaveLength(0);
  });
});
