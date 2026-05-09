import { ReactFlowProvider } from '@xyflow/react';
import FlowCanvas from './components/canvas/FlowCanvas';
import ErrorBoundary from './components/shared/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </ErrorBoundary>
  );
}
