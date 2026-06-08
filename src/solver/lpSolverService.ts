import type { Edge } from '@xyflow/react';
import type { RecipeNodeType } from '../types/nodes';
import type { LPSolverResponse, LPFailureDiagnostics } from './lpTypes';
import { ASSET_VERSION } from '../data/productIcons';
import { buildLPSolverPayload } from './lpPayload';
export type { LPFailureDiagnostics } from './lpTypes';

export interface LPSolverResult {
  feasible: boolean;
  error?: string;
  machineCounts?: Record<string, number>;
  diagnostics?: LPFailureDiagnostics;
}

export interface LPSolverSession {
  promise: Promise<LPSolverResult>;
}

let activeWorker: Worker | null = null;
let activeSolveInFlight = false;
let activeSolveResolve: ((result: LPSolverResult) => void) | null = null;

function finalizeActiveSolve(result: LPSolverResult): void {
  const resolve = activeSolveResolve;
  activeSolveResolve = null;
  activeSolveInFlight = false;
  if (resolve) {
    resolve(result);
  }
}

function createWorker(): Worker {
  return new Worker(
    new URL('./lpWorker.ts', import.meta.url),
    { type: 'module' }
  );
}

function getOrCreateWorker(): Worker {
  if (!activeWorker) {
    activeWorker = createWorker();
  }
  return activeWorker;
}

export function initLPSolverWorker(): void {
  getOrCreateWorker();
}

export function isLPSolverRunning(): boolean {
  return activeSolveInFlight;
}

export function cancelLPSolver(): void {
  if (activeWorker) {
    activeWorker.terminate();
    activeWorker = null;
  }
  if (activeSolveInFlight) {
    finalizeActiveSolve({
      feasible: false,
      error: 'Computation cancelled.',
    });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (activeWorker) {
      activeWorker.terminate();
      activeWorker = null;
    }
  });
}

export function solveLP(
  nodes: RecipeNodeType[],
  edges: Edge[]
): LPSolverSession {
  if (activeSolveInFlight) {
    return {
      promise: Promise.resolve({
        feasible: false,
        error: 'LP solver is already running. Please wait for the current computation to finish.',
      }),
    };
  }
  activeSolveInFlight = true;

  const payload = buildLPSolverPayload(nodes, edges);
  const worker = getOrCreateWorker();

  const promise = new Promise<LPSolverResult>((resolve) => {
    activeSolveResolve = resolve;

    worker.onmessage = (event: MessageEvent<LPSolverResponse>) => {
      worker.onmessage = null;
      worker.onerror = null;
      finalizeActiveSolve(event.data);
    };

    worker.onerror = (err) => {
      worker.onmessage = null;
      worker.onerror = null;
      console.error('[LP Solver Service] Worker thread error:', err);
      finalizeActiveSolve({
        feasible: false,
        error: 'Background worker thread encountered a runtime error.',
      });
      activeWorker = null;
    };

    try {
      worker.postMessage({
        origin: window.location.origin,
        nodes: payload.nodes,
        connections: payload.connections,
        version: ASSET_VERSION,
      });
    } catch (error) {
      worker.onmessage = null;
      worker.onerror = null;
      finalizeActiveSolve({
        feasible: false,
        error:
          error instanceof Error
            ? `Failed to dispatch LP request: ${error.message}`
            : 'Failed to dispatch LP request.',
      });
    }
  });

  return {
    promise,
  };
}
