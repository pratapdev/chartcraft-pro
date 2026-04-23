import React, { useEffect } from 'react';
import { PanelChart } from './PanelChart';
import { PanelProvider } from './PanelContext';
import { useMultiPanelStore } from '@/stores/multiPanelStore';
import { useChartStore } from '@/stores/chartStore';
import { LayoutGrid, Columns2 } from 'lucide-react';

export const MultiTimeframeView: React.FC = () => {
  const globalSymbol = useChartStore((s) => s.symbol);
  const gridMode = useMultiPanelStore((s) => s.gridMode);
  const setGridMode = useMultiPanelStore((s) => s.setGridMode);
  const initPanels = useMultiPanelStore((s) => s.initPanels);
  const activePanelIndex = useMultiPanelStore((s) => s.activePanelIndex);

  // Initialize panels on first mount
  useEffect(() => {
    initPanels(globalSymbol);
  }, []);

  const panelCount = gridMode === 2 ? 2 : 4;
  const panelIndices = Array.from({ length: panelCount }, (_, i) => i);

  const gridStyle = gridMode === 4
    ? { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' }
    : { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: '1fr' };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Layout controls bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-card shrink-0">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide mr-1">Layout</span>
        <button
          onClick={() => setGridMode(2)}
          className={`p-1 rounded transition-colors ${gridMode === 2 ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          title="2 windows"
        >
          <Columns2 size={14} />
        </button>
        <button
          onClick={() => setGridMode(4)}
          className={`p-1 rounded transition-colors ${gridMode === 4 ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          title="4 windows (2×2)"
        >
          <LayoutGrid size={14} />
        </button>

        {/* Active panel indicator */}
        <span className="text-[10px] text-muted-foreground ml-2">
          Active: <span className="text-blue-400 font-semibold">Panel {activePanelIndex + 1}</span>
        </span>
      </div>

      {/* Chart grid */}
      <div className="grid flex-1 min-h-0 overflow-hidden" style={gridStyle}>
        {panelIndices.map((idx) => (
          <PanelProvider key={`panel-${gridMode}-${idx}`} panelIndex={idx}>
            <div className="overflow-hidden h-full">
              <PanelChart />
            </div>
          </PanelProvider>
        ))}
      </div>
    </div>
  );
};
