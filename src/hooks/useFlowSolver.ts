import { useEffect, useRef } from 'react';
import { useFlowStore } from '../stores/useFlowStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { solveFlowAndTemperature } from '../solver/temperaturePropagator';
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

      const { results, edgeFlows, edgeTemps, inputTemps } = solveFlowAndTemperature(nodes, edges);
      useFlowResultStore.getState().setResults(results, edgeFlows, edgeTemps, inputTemps);
    }

    function scheduleRecompute() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(recompute, SOLVER_DEBOUNCE_MS);
    }

    const unsubFlow = useFlowStore.subscribe(
      (state) => state.solverVersion,
      () => {
        scheduleRecompute();
      },
    );

    recompute();

    return () => {
      unsubFlow();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
