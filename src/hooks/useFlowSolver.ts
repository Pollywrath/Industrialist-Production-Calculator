import { useEffect, useRef } from 'react';
import { useFlowStore } from '../stores/useFlowStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { useDataStore } from '../stores/useDataStore';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { solveFlowPipeline } from '../solver/solverPipeline';
import { SOLVER_DEBOUNCE_MS } from '../components/shared/layoutConstants';

export function useFlowSolver(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runTokenRef = useRef(0);

  useEffect(() => {
    function recompute(runToken: number) {
      const { nodes, edges, graphVersion } = useFlowStore.getState();
      const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<string, unknown>;
      if (runToken !== runTokenRef.current) return;

      if (nodes.length === 0) {
        if (runToken !== runTokenRef.current) return;
        useFlowResultStore.getState().setResults(new Map(), {}, {}, {}, {}, {}, graphVersion);
        useFlowStore.getState().markSolutionCommitted();
        return;
      }

      const { results, edgeFlows, edgeTemps, inputTemps, resolvedProducts, nodeRecipes } = solveFlowPipeline(
        nodes,
        edges,
        globalSettings,
      );
      if (runToken !== runTokenRef.current) return;
      useFlowResultStore.getState().setResults(results, edgeFlows, edgeTemps, inputTemps, resolvedProducts, nodeRecipes, graphVersion);
      useFlowStore.getState().markSolutionCommitted();
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

    let lastPollution = useGlobalSettingsStore.getState().settings.global_pollution;
    const unsubPollution = useGlobalSettingsStore.subscribe((state) => {
      if (state.settings.global_pollution !== lastPollution) {
        lastPollution = state.settings.global_pollution;
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
      unsubPollution();
      unsubFlow();
      if (timerRef.current) clearTimeout(timerRef.current);
      runTokenRef.current += 1;
    };
  }, []);
}
