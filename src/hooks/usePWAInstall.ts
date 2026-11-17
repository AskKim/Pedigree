/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Compatibility re-export wrapper delegating PWA installation & online-status
 * detection to the canonical hooks in `src/storage/storageProtection.ts`
 * (preventing duplicate window listeners and keeping iPadOS/legacy fallback logic unified).
 */

import { useCallback } from 'react';
import {
  useOnlineStatus as useCanonicalOnlineStatus,
  usePWAInstall as useCanonicalPWAInstall,
} from '../storage/storageProtection';

export function usePWAInstall() {
  const { canPromptInstall, isInstalled, isIos, promptInstall } = useCanonicalPWAInstall();

  const install = useCallback(async () => {
    const outcome = await promptInstall();
    return outcome === 'accepted';
  }, [promptInstall]);

  return {
    isInstallable: canPromptInstall,
    isInstalled,
    isIOS: isIos,
    install,
  };
}

export function useOnlineStatus(): boolean {
  return useCanonicalOnlineStatus();
}
