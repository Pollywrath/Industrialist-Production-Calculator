import { useEffect, useRef } from 'react';
import useFlowStore from '../stores/useFlowStore';
import useFlowResultStore from '../stores/useFlowResultStore';
import { buildSolverGraph } from '../solver/graphBuilder';
import { calculateFlows } from '../solver/flowSolver';
import { SOLVER_DEBOUNCE_MS } from '../components/shared/layoutConstants';


export function useFlowSolver(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function recompute() {
      const { nodes, edges } = useFlowStore.getState();

      if (nodes.length === 0) {
        useFlowResultStore.getState().setResults(new Map());
        return;
      }

      const graph = buildSolverGraph(nodes, edges);
      const results = calculateFlows(graph);
      useFlowResultStore.getState().setResults(results);
    }

    function scheduleRecompute() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(recompute, SOLVER_DEBOUNCE_MS);
    }

    const unsubFlow = useFlowStore.subscribe(
      (state) => state.solverVersion,
      () => {
        scheduleRecompute();
      }
    );

    recompute();

    return () => {
      unsubFlow();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
