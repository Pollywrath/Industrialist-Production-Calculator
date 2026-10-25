import { useEffect, useRef } from 'react';
import { useFlowStore } from '../stores/useFlowStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { useDataStore } from '../stores/useDataStore';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import {
  createEmptyTemperatureDiagnostics,
  solveFlowPipeline,
  type SolverPipelineResult,
} from '../solver/solverPipeline';
import type {
  FlowSolverWorkerRequest,
  FlowSolverWorkerResponse,
} from '../solver/flowSolverWorkerProtocol';
import { SOLVER_DEBOUNCE_MS } from '../constants/layoutConstants';
import { isRecipeNode } from '../types/nodes';
import { areFlowResultVersionsCurrent } from '../utils/flowResultFreshness';

export function commitFlowSolverResultIfCurrent(
  result: SolverPipelineResult,
  resultGraphVersion: number,
  resultDataDbVersion: number,
  currentGraphVersion: number,
  currentDataDbVersion: number,
): boolean {
  if (
    !areFlowResultVersionsCurrent(
      resultGraphVersion,
      resultDataDbVersion,
      currentGraphVersion,
      currentDataDbVersion,
    )
  ) {
    return false;
  }

  useFlowResultStore
    .getState()
    .setResults(
      result.results,
      result.edgeFlows,
      result.edgeTemps,
      result.inputTemps,
      result.resolvedProducts,
      result.nodeRecipes,
      resultGraphVersion,
      resultDataDbVersion,
      result.temperatureDiagnostics,
    );
  return true;
}

export function useFlowSolver(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runTokenRef = useRef(0);

  useEffect(() => {
    let worker: Worker | null = null;
    let workerFailed = false;
    let workerBusy = false;
    let nextRequestId = 0;
    let workerInFlight: { request: FlowSolverWorkerRequest; runToken: number } | null = null;
    let pendingWorkerRequest: { request: FlowSolverWorkerRequest; runToken: number } | null = null;
    let latestRequest: { request: FlowSolverWorkerRequest; runToken: number } | null = null;

    function commitResult(request: FlowSolverWorkerRequest, result: SolverPipelineResult) {
      if (
        !commitFlowSolverResultIfCurrent(
          result,
          request.graphVersion,
          request.dataDbVersion,
          useFlowStore.getState().graphVersion,
          useDataStore.getState().dbVersion,
        )
      ) {
        return;
      }
      useFlowStore.getState().markSolutionCommitted();
    }

    function solveOnMain(request: { request: FlowSolverWorkerRequest; runToken: number }) {
      if (request.runToken !== runTokenRef.current) return;
      try {
        const result = solveFlowPipeline(
          request.request.nodes,
          request.request.edges,
          request.request.globalSettings,
        );
        if (request.runToken === runTokenRef.current) commitResult(request.request, result);
      } catch (error) {
        console.error('The flow solver failed on the main thread.', error);
      }
    }

    function failWorker(error: unknown) {
      if (workerFailed) return;
      workerFailed = true;
      worker?.terminate();
      worker = null;
      workerBusy = false;
      workerInFlight = null;
      pendingWorkerRequest = null;
      console.error('The flow solver worker failed; using the main-thread solver instead.', error);
      if (latestRequest?.runToken === runTokenRef.current) solveOnMain(latestRequest);
    }

    function dispatchWorkerRequest() {
      if (!worker || workerFailed || workerBusy || !pendingWorkerRequest) return;
      const next = pendingWorkerRequest;
      pendingWorkerRequest = null;
      workerBusy = true;
      workerInFlight = next;
      try {
        worker.postMessage(next.request);
      } catch (error) {
        failWorker(error);
      }
    }

    try {
      worker = new Worker(new URL('../solver/flowSolverWorker.ts', import.meta.url), {
        type: 'module',
      });
      worker.addEventListener('message', (event: MessageEvent<FlowSolverWorkerResponse>) => {
        const activeRequest = workerInFlight;
        const response = event.data;
        if (!activeRequest || response.requestId !== activeRequest.request.requestId) {
          failWorker(new Error('The flow solver worker returned an unexpected request ID.'));
          return;
        }
        workerBusy = false;
        workerInFlight = null;
        if ('error' in response) {
          failWorker(new Error(response.error));
          return;
        }
        if (activeRequest.runToken === runTokenRef.current) {
          commitResult(activeRequest.request, response.result);
        }
        dispatchWorkerRequest();
      });
      worker.addEventListener('error', (event) => {
        event.preventDefault();
        failWorker(new Error(event.message || 'The flow solver worker stopped unexpectedly.'));
      });
      worker.addEventListener('messageerror', () => {
        failWorker(new Error('The flow solver worker response could not be read.'));
      });
    } catch (error) {
      workerFailed = true;
      console.error('The flow solver worker could not start; using the main-thread solver.', error);
    }

    function recompute(runToken: number) {
      const { nodes, edges, graphVersion } = useFlowStore.getState();
      const dataDbVersion = useDataStore.getState().dbVersion;
      const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
        string,
        unknown
      >;
      if (runToken !== runTokenRef.current) return;

      const recipeNodes = nodes.filter(isRecipeNode);
      const recipeNodeIds = new Set(recipeNodes.map((node) => node.id));
      const recipeEdges = edges.filter(
        (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
      );

      if (recipeNodes.length === 0) {
        if (runToken !== runTokenRef.current) return;
        useFlowResultStore
          .getState()
          .setResults(
            new Map(),
            {},
            {},
            {},
            {},
            {},
            graphVersion,
            dataDbVersion,
            createEmptyTemperatureDiagnostics(),
          );
        useFlowStore.getState().markSolutionCommitted();
        return;
      }

      const request = {
        requestId: ++nextRequestId,
        graphVersion,
        dataDbVersion,
        nodes: recipeNodes,
        edges: recipeEdges,
        globalSettings,
      };
      const versionedRequest = { request, runToken };
      latestRequest = versionedRequest;
      if (worker && !workerFailed) {
        pendingWorkerRequest = versionedRequest;
        dispatchWorkerRequest();
      } else {
        solveOnMain(versionedRequest);
      }
    }

    function scheduleRecompute() {
      if (timerRef.current) clearTimeout(timerRef.current);
      const nextToken = runTokenRef.current + 1;
      runTokenRef.current = nextToken;
      timerRef.current = setTimeout(() => {
        recompute(nextToken);
      }, SOLVER_DEBOUNCE_MS);
    }

    let lastDbVersion = useDataStore.getState().dbVersion;
    const unsubData = useDataStore.subscribe((state) => {
      if (state.dbVersion !== lastDbVersion) {
        lastDbVersion = state.dbVersion;
        useFlowStore.setState((s) => ({ graphVersion: s.graphVersion + 1 }));
      }
    });

    let lastGlobalSettings = useGlobalSettingsStore.getState().settings;
    const unsubGlobalSettings = useGlobalSettingsStore.subscribe((state) => {
      if (state.settings !== lastGlobalSettings) {
        lastGlobalSettings = state.settings;
        useFlowStore.setState((s) => ({ graphVersion: s.graphVersion + 1 }));
      }
    });

    const unsubFlow = useFlowStore.subscribe(
      (state) => state.graphVersion,
      () => {
        scheduleRecompute();
      },
    );

    const initialToken = runTokenRef.current + 1;
    runTokenRef.current = initialToken;
    recompute(initialToken);

    return () => {
      unsubData();
      unsubGlobalSettings();
      unsubFlow();
      if (timerRef.current) clearTimeout(timerRef.current);
      worker?.terminate();
      worker = null;
      pendingWorkerRequest = null;
      workerInFlight = null;
      runTokenRef.current += 1;
    };
  }, []);
}
