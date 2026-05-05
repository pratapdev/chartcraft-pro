import React, { useState } from 'react';
import { TopBar } from '@/components/TopBar/TopBar';
import { LeftToolbar } from '@/components/Toolbar/LeftToolbar';
import { ChartContainer } from '@/components/Chart/ChartContainer';
import { MultiTimeframeView } from '@/components/Chart/MultiTimeframeView';
import { RightSidebar } from '@/components/RightSidebar/RightSidebar';
import { BottomPanel } from '@/components/BottomPanel/BottomPanel';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { AISidekick } from '@/components/AISidekick';
import { useAlertChecker } from '@/hooks/useAlertChecker';
import { useAlertPriceTracker } from '@/hooks/useAlertPriceTracker';
import { useChartStore } from '@/stores/chartStore';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Bot } from 'lucide-react';

const Index: React.FC = () => {
  useAlertPriceTracker();
  useAlertChecker();
  const multiTfMode = useChartStore((s) => s.multiTfMode);
  const rightPanelOpen = useChartStore((s) => s.rightPanelOpen);
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TopBar aiOpen={aiOpen} onToggleAI={() => setAiOpen(v => !v)} />
      <div className="flex flex-1 min-h-0">
        <LeftToolbar />
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={rightPanelOpen && !multiTfMode ? 75 : 100} minSize={40}>
            <div className="flex flex-col h-full min-w-0">
              <div className="flex-1 min-h-0">
                {multiTfMode ? <MultiTimeframeView /> : <ChartContainer />}
              </div>
              {!multiTfMode && <BottomPanel />}
            </div>
          </ResizablePanel>
          {!multiTfMode && rightPanelOpen && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={20} minSize={12} maxSize={40}>
                <RightSidebar />
              </ResizablePanel>
            </>
          )}
          {!multiTfMode && aiOpen && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={22} minSize={16} maxSize={40}>
                <AISidekick onClose={() => setAiOpen(false)} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
      <KeyboardShortcuts />
    </div>
  );
};

export default Index;
