import { initializeDatabase, reloadDatabase } from '../data/lookup';
import { solveFlowPipeline } from './solverPipeline';
import type { FlowSolverWorkerRequest, FlowSolverWorkerResponse } from './flowSolverWorkerProtocol';

interface FlowSolverWorkerScope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<FlowSolverWorkerRequest>) => void,
  ): void;
  postMessage(message: FlowSolverWorkerResponse): void;
}

const workerScope = self as unknown as FlowSolverWorkerScope;
let initialization: Promise<void> | null = null;
let loadedDataDbVersion: number | null = null;
let queuedWork = Promise.resolve();

async function solveRequest(request: FlowSolverWorkerRequest) {
  initialization ??= initializeDatabase();
  await initialization;
  if (loadedDataDbVersion !== null && loadedDataDbVersion !== request.dataDbVersion) {
    await reloadDatabase();
  }
  loadedDataDbVersion = request.dataDbVersion;
  const result = solveFlowPipeline(request.nodes, request.edges, request.globalSettings);
  workerScope.postMessage({ requestId: request.requestId, result });
}

workerScope.addEventListener('message', (event) => {
  const request = event.data;
  queuedWork = queuedWork
    .then(() => solveRequest(request))
    .catch((error: unknown) => {
      workerScope.postMessage({
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
});
