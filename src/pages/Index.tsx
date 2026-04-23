import React from 'react';
import { TopBar } from '@/components/TopBar/TopBar';
import { LeftToolbar } from '@/components/Toolbar/LeftToolbar';
import { ChartContainer } from '@/components/Chart/ChartContainer';
import { MultiTimeframeView } from '@/components/Chart/MultiTimeframeView';
import { RightSidebar } from '@/components/RightSidebar/RightSidebar';
import { BottomPanel } from '@/components/BottomPanel/BottomPanel';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { useAlertChecker } from '@/hooks/useAlertChecker';
import { useAlertPriceTracker } from '@/hooks/useAlertPriceTracker';
import { useChartStore } from '@/stores/chartStore';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

const Index: React.FC = () => {
  useAlertPriceTracker();
  useAlertChecker();
  const multiTfMode = useChartStore((s) => s.multiTfMode);
  const rightPanelOpen = useChartStore((s) => s.rightPanelOpen);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        {/* LeftToolbar now visible in both modes */}
        <LeftToolbar />
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={rightPanelOpen ? 80 : 100} minSize={40}>
            <div className="flex flex-col h-full min-w-0">
              <div className="flex-1 min-h-0">
                {multiTfMode ? <MultiTimeframeView /> : <ChartContainer />}
              </div>
              {!multiTfMode && <BottomPanel />}
            </div>
          </ResizablePanel>
          {/* RightSidebar now visible in both modes */}
          {rightPanelOpen && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={20} minSize={12} maxSize={40}>
                <RightSidebar />
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
