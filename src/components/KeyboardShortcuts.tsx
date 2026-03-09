import React, { useEffect, useState } from 'react';
import { useChartStore } from '@/stores/chartStore';
import { DrawingTool } from '@/types/trading';
import { Keyboard, X } from 'lucide-react';

import { SymbolSearch } from './SymbolSearch';

const SHORTCUTS: { key: string; label: string; description: string; action?: () => void }[] = [
  { key: 'Ctrl+K', label: '⌘K', description: 'Search symbols' },
  { key: 'V', label: 'V', description: 'Cursor / Select' },
  { key: 'T', label: 'T', description: 'Trendline' },
  { key: 'H', label: 'H', description: 'Horizontal Line' },
  { key: 'F', label: 'F', description: 'Fibonacci Retracement' },
  { key: 'M', label: 'M', description: 'Measure Tool' },
  { key: 'Delete', label: 'Del', description: 'Delete selected drawing' },
  { key: 'Escape', label: 'Esc', description: 'Cancel drawing / Deselect' },
  { key: 'Ctrl+Z', label: 'Ctrl+Z', description: 'Undo last deletion' },
  { key: 'Ctrl+Y', label: 'Ctrl+Y', description: 'Redo last deletion' },
  { key: 'A', label: 'A', description: 'Open Alerts panel' },
  { key: 'I', label: 'I', description: 'Open Indicators panel' },
  { key: 'S', label: 'S', description: 'Open Settings panel' },
  { key: '?', label: '?', description: 'Toggle shortcuts panel' },
];

const TOOL_MAP: Record<string, DrawingTool> = {
  v: 'cursor',
  t: 'trendline',
  h: 'horizontal',
  f: 'fibonacci',
  m: 'measure',
};

export const KeyboardShortcuts: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const {
    setActiveTool,
    setRightPanelTab,
    selectedTrendlineId,
    removeTrendline,
    setSelectedTrendlineId,
    selectedFibId,
    removeFibonacci,
  } = useChartStore.getState as any;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const key = e.key.toLowerCase();
      const store = useChartStore.getState();

      // Toggle shortcuts panel
      if (e.key === '?') {
        setOpen((prev) => !prev);
        return;
      }

      // Tool shortcuts
      if (TOOL_MAP[key]) {
        store.setActiveTool(TOOL_MAP[key]);
        return;
      }

      // Panel shortcuts
      if (key === 'a') { store.setRightPanelTab('alerts'); return; }
      if (key === 'i') { store.setRightPanelTab('indicators'); return; }
      if (key === 's') { store.setRightPanelTab('settings'); return; }

      // Undo
      if (key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        store.undoLastDeletion();
        return;
      }

      // Redo (Ctrl+Y or Ctrl+Shift+Z)
      if ((key === 'y' && (e.ctrlKey || e.metaKey)) || (key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault();
        store.redoLastDeletion();
        return;
      }

      // Delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedTrendlineId) {
          store.removeTrendline(store.selectedTrendlineId);
          return;
        }
        if (store.selectedIndicatorId) {
          const ind = store.indicators.find((i) => i.id === store.selectedIndicatorId);
          if (ind && window.confirm(`Remove ${ind.type}(${ind.period})?`)) {
            store.removeIndicator(store.selectedIndicatorId);
          }
          return;
        }
      }

      // Escape
      if (e.key === 'Escape') {
        store.setActiveTool('cursor');
        store.setSelectedTrendlineId(null);
        store.setSelectedIndicatorId(null);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((prev: boolean) => !prev)}
        className="fixed bottom-3 right-3 z-50 w-8 h-8 flex items-center justify-center rounded bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Keyboard Shortcuts (?)"
      >
        <Keyboard size={14} />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="bg-card border border-border rounded-lg shadow-xl w-80 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Keyboard size={14} />
                Keyboard Shortcuts
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            </div>
            <div className="p-3 space-y-1">
              {SHORTCUTS.map((s) => (
                <div key={s.key} className="flex items-center justify-between py-1.5 px-1">
                  <span className="text-xs text-muted-foreground">{s.description}</span>
                  <kbd className="text-[10px] font-mono bg-accent text-foreground px-2 py-0.5 rounded border border-border min-w-[28px] text-center">
                    {s.label}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
