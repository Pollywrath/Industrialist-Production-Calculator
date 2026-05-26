import { useEffect, useRef } from 'react';
import { useFlowStore } from '../stores/useFlowStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { useDataStore } from '../stores/useDataStore';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import { solveFlows } from '../solver/flowSolver';
import { propagateTemperatures } from '../solver/temperaturePropagator';
import { SOLVER_DEBOUNCE_MS } from '../components/shared/layoutConstants';

export function useFlowSolver(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function recompute() {
      const { nodes, edges } = useFlowStore.getState();

      if (nodes.length === 0) {
        useFlowResultStore.getState().setResults(new Map(), {}, {}, {});
        return;
      }

      const { results, edgeFlows } = solveFlows(nodes, edges);
      const { edgeTemps, inputTemps } = propagateTemperatures(nodes, edges, edgeFlows);
      useFlowResultStore.getState().setResults(results, edgeFlows, edgeTemps, inputTemps);
    }

    function scheduleRecompute() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(recompute, SOLVER_DEBOUNCE_MS);
    }

    let lastDbVersion = useDataStore.getState().dbVersion;
    const unsubData = useDataStore.subscribe((state) => {
      if (state.dbVersion !== lastDbVersion) {
        lastDbVersion = state.dbVersion;
        useFlowStore.setState((s) => ({ solverVersion: s.solverVersion + 1 }));
      }
    });

    let lastPollution = useGlobalSettingsStore.getState().settings.global_pollution;
    const unsubPollution = useGlobalSettingsStore.subscribe((state) => {
      if (state.settings.global_pollution !== lastPollution) {
        lastPollution = state.settings.global_pollution;
        useFlowStore.setState((s) => ({ solverVersion: s.solverVersion + 1 }));
      }
    });

    const unsubFlow = useFlowStore.subscribe(
      (state) => state.solverVersion,
      () => {
        scheduleRecompute();
      },
    );

    recompute();

    return () => {
      unsubData();
      unsubPollution();
      unsubFlow();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
