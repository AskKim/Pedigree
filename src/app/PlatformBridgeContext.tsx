/**
 * @license
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * React Context for `IPlatformBridge` Dependency Injection (`@app/PlatformBridgeContext.tsx`).
 *
 * Eliminates direct concrete `pedigreeBridge` singleton imports across UI screens
 * and modals while keeping standalone unit tests and browser previews zero-config.
 */

import React, { createContext, useContext, useEffect } from 'react';
import type { IPlatformBridge } from '@engine/bridge';
import {
  getDefaultPedigreeBridge,
  initializePedigreeRuntimeDefaults,
} from './pedigreeAppWiring';

const PlatformBridgeContext = createContext<IPlatformBridge | null>(null);

export interface PlatformBridgeProviderProps {
  bridge: IPlatformBridge;
  children: React.ReactNode;
}

export function PlatformBridgeProvider({ bridge, children }: PlatformBridgeProviderProps) {
  useEffect(() => {
    initializePedigreeRuntimeDefaults(bridge);
  }, [bridge]);

  return (
    <PlatformBridgeContext.Provider value={bridge}>
      {children}
    </PlatformBridgeContext.Provider>
  );
}

export function usePlatformBridge(): IPlatformBridge {
  const ctx = useContext(PlatformBridgeContext);
  return ctx ?? getDefaultPedigreeBridge();
}
