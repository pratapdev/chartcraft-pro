import React from 'react';
import { TopBar } from '@/components/TopBar/TopBar';
import { LeftToolbar } from '@/components/Toolbar/LeftToolbar';
import { ChartContainer } from '@/components/Chart/ChartContainer';
import { RightSidebar } from '@/components/RightSidebar/RightSidebar';
import { BottomPanel } from '@/components/BottomPanel/BottomPanel';
import { useAlertChecker } from '@/hooks/useAlertChecker';

const Index: React.FC = () => {
  useAlertChecker();
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <TopBar />
      <div className="flex flex-1 min-h-0">
        <LeftToolbar />
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <ChartContainer />
          </div>
          <BottomPanel />
        </div>
        <RightSidebar />
      </div>
    </div>
  );
};

export default Index;
