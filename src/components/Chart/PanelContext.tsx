import React, { createContext, useContext } from 'react';

// ─── Panel Index Context ─────────────────────────────────────────────
// Provides the panel index to all child components so they know which
// panel they belong to in the multi-TF grid.

interface PanelContextValue {
  panelIndex: number;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export const PanelProvider: React.FC<{ panelIndex: number; children: React.ReactNode }> = ({
  panelIndex,
  children,
}) => {
  return (
    <PanelContext.Provider value={{ panelIndex }}>
      {children}
    </PanelContext.Provider>
  );
};

/**
 * Returns the panel index of the current chart panel.
 * Returns null when NOT inside a multi-TF panel (i.e. the global single chart).
 */
export function usePanelIndex(): number | null {
  const ctx = useContext(PanelContext);
  return ctx?.panelIndex ?? null;
}

/**
 * Returns the panel index, throwing if not inside a panel context.
 * Use only in components that MUST be inside a panel.
 */
export function usePanelIndexRequired(): number {
  const ctx = useContext(PanelContext);
  if (ctx === null) {
    throw new Error('usePanelIndexRequired must be used inside a PanelProvider');
  }
  return ctx.panelIndex;
}
