import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { FlowCanvas } from './components/canvas/FlowCanvas';
import { initializeDatabase } from './data/lookup';
import { LoadingScreen } from './components/shared/LoadingScreen';
import { ConfirmDialog } from './components/shared/ConfirmDialog';
import { PwaManager } from './pwa/PwaManager';
import { NotFoundPage } from './components/shared/NotFoundPage';

function isAppPath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return normalizedPath === '/' || normalizedPath === '/index.html';
}

export function App() {
  const [isDatabaseLoaded, setIsDatabaseLoaded] = useState(false);
  const [, setThrowError] = useState<unknown>();
  const isNotFound = !isAppPath(window.location.pathname);

  useEffect(() => {
    if (isNotFound) return;

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
  }, [isNotFound]);

  return (
    <>
      <PwaManager />
      {isNotFound ? (
        <NotFoundPage />
      ) : !isDatabaseLoaded ? (
        <LoadingScreen title="Loading calculator" subtitle="Loading data..." />
      ) : (
        <ReactFlowProvider>
          <FlowCanvas />
          <ConfirmDialog />
        </ReactFlowProvider>
      )}
    </>
  );
}
