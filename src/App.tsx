import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowCanvas } from './components/canvas/FlowCanvas';
import { initializeDatabase } from './data/lookup';
import { LoadingScreen } from './components/shared/LoadingScreen';
import { ConfirmDialog } from './components/shared/ConfirmDialog';

export function App() {
  const [isDatabaseLoaded, setIsDatabaseLoaded] = useState(false);
  const [, setThrowError] = useState<unknown>();

  useEffect(() => {
    initializeDatabase()
      .then(() => {
        setIsDatabaseLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to initialize database:', err);
        setThrowError(() => {
          throw err;
        });
      });
  }, []);

  if (!isDatabaseLoaded) {
    return (
      <LoadingScreen title="SYSTEM INITIALIZATION" subtitle="Initializing system database..." />
    );
  }

  return (
    <ReactFlowProvider>
      <FlowCanvas />
      <ConfirmDialog />
    </ReactFlowProvider>
  );
}
