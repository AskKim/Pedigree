/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Accessible Modal Dialog Hook (`src/utils/useAccessibleDialog.ts`).
 *
 * Provides consistent keyboard & screen-reader dialog behavior across all modals:
 * - Saves previously focused trigger element and restores focus on close/unmount
 * - Traps `Tab` / `Shift+Tab` inside the active (topmost) modal dialog
 * - Handles `Escape` on the topmost `[role="dialog"][aria-modal="true"]` only
 *   (unless prevented by an inner combobox or `closeOnEscape === false`)
 * - Moves initial focus cleanly into the dialog on open
 */

import { RefObject, useEffect, useRef } from 'react';

type OpenDialogListener = (openCount: number) => void;
let openDialogCount = 0;
const openDialogListeners = new Set<OpenDialogListener>();

function notifyOpenDialogListeners(): void {
  for (const listener of openDialogListeners) {
    try {
      listener(openDialogCount);
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function getOpenDialogCount(): number {
  return openDialogCount;
}

export function subscribeOpenDialogCount(listener: OpenDialogListener): () => void {
  openDialogListeners.add(listener);
  listener(openDialogCount);
  return () => {
    openDialogListeners.delete(listener);
  };
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled]):not([aria-hidden="true"])',
  'input:not([disabled]):not([type="hidden"]):not([aria-hidden="true"])',
  'select:not([disabled]):not([aria-hidden="true"])',
  'textarea:not([disabled]):not([aria-hidden="true"])',
  '[tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])',
].join(', ');

function getVisibleFocusableElements(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  return candidates.filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
      return false;
    }
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
    return el.getClientRects().length > 0;
  });
}

function isTopmostDialog(container: HTMLElement): boolean {
  const allDialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
  if (allDialogs.length === 0) return true;
  return allDialogs[allDialogs.length - 1] === container;
}

export interface UseAccessibleDialogOptions {
  isOpen: boolean;
  onClose: () => void;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function useAccessibleDialog<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  closeOnEscape = true,
  initialFocusRef,
}: UseAccessibleDialogOptions): RefObject<T | null> {
  const dialogRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    openDialogCount += 1;
    notifyOpenDialogListeners();

    const container = dialogRef.current;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const rafId = window.requestAnimationFrame(() => {
      const targetEl = initialFocusRef?.current;
      if (targetEl && typeof targetEl.focus === 'function') {
        targetEl.focus({ preventScroll: true });
        return;
      }
      if (!container) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && container.contains(active) && active !== container) {
        return;
      }
      const focusables = getVisibleFocusableElements(container);
      if (focusables.length > 0) {
        focusables[0].focus({ preventScroll: true });
      } else {
        container.focus({ preventScroll: true });
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!container || !isTopmostDialog(container)) return;

      if (e.key === 'Escape') {
        if (!e.defaultPrevented && closeOnEscape) {
          e.preventDefault();
          onCloseRef.current();
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusables = getVisibleFocusableElements(container);
        if (focusables.length === 0) {
          e.preventDefault();
          container.focus({ preventScroll: true });
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (!active || !container.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus({ preventScroll: true });
          return;
        }

        if (e.shiftKey) {
          if (active === first || active === container) {
            e.preventDefault();
            last.focus({ preventScroll: true });
          }
        } else if (active === last) {
          e.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      openDialogCount = Math.max(0, openDialogCount - 1);
      notifyOpenDialogListeners();
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('keydown', handleKeyDown);
      if (
        previouslyFocused &&
        previouslyFocused.isConnected &&
        typeof previouslyFocused.focus === 'function'
      ) {
        window.requestAnimationFrame(() => {
          if (previouslyFocused.isConnected) {
            previouslyFocused.focus({ preventScroll: true });
          }
        });
      }
    };
  }, [isOpen, closeOnEscape, initialFocusRef]);

  return dialogRef;
}
