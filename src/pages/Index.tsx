import React from 'react';
import { TopBar } from '@/components/TopBar/TopBar';
import { LeftToolbar } from '@/components/Toolbar/LeftToolbar';
import { ChartContainer } from '@/components/Chart/ChartContainer';
import { MultiTimeframeView } from '@/components/Chart/MultiTimeframeView';
import { RightSidebar } from '@/components/RightSidebar/RightSidebar';
import { BottomPanel } from '@/components/BottomPanel/BottomPanel';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { useAlertChecker } from '@/hooks/useAlertChecker';
import { useChartStore } from '@/stores/chartStore';

const Index: React.FC = () => {
  useAlertChecker();
  const multiTfMode = useChartStore((s) => s.multiTfMode);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        {!multiTfMode && <LeftToolbar />}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            {multiTfMode ? <MultiTimeframeView /> : <ChartContainer />}
          </div>
          {!multiTfMode && <BottomPanel />}
        </div>
        {!multiTfMode && <RightSidebar />}
      </div>
      <KeyboardShortcuts />
    </div>
  );
};

export default Index;
