import { useEffect, useRef } from 'react';
import type { Edge } from '@xyflow/react';
import useFlowStore from '../stores/useFlowStore';
import useFlowResultStore from '../stores/useFlowResultStore';
import { buildSolverGraph } from '../solver/graphBuilder';
import { calculateFlows } from '../solver/flowSolver';

const DEBOUNCE_MS = 100;

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
      timerRef.current = setTimeout(recompute, DEBOUNCE_MS);
    }

    function areEdgesSemanticallyEqual(a: Edge[], b: Edge[]): boolean {
      if (a === b) return true;
      if (a.length !== b.length) return false;
      const bMap = new Map(b.map((e) => [e.id, e]));
      for (const eA of a) {
        const eB = bMap.get(eA.id);
        if (!eB) return false;
        if (
          eA.source !== eB.source ||
          eA.target !== eB.target ||
          eA.sourceHandle !== eB.sourceHandle ||
          eA.targetHandle !== eB.targetHandle
        ) {
          return false;
        }
      }
      return true;
    }

    let prevNodes = useFlowStore.getState().nodes;
    let prevEdges = useFlowStore.getState().edges;

    const unsubFlow = useFlowStore.subscribe((state) => {
      if (state.nodes === prevNodes && state.edges === prevEdges) {
        return;
      }

      if (state.nodes.length !== prevNodes.length) {
        prevNodes = state.nodes;
        prevEdges = state.edges;
        scheduleRecompute();
        return;
      }

      if (state.edges !== prevEdges && !areEdgesSemanticallyEqual(state.edges, prevEdges)) {
        prevNodes = state.nodes;
        prevEdges = state.edges;
        scheduleRecompute();
        return;
      }

      for (let i = 0; i < state.nodes.length; i++) {
        if (state.nodes[i] !== prevNodes[i]) {
          if (state.nodes[i].data !== prevNodes[i].data) {
            prevNodes = state.nodes;
            prevEdges = state.edges;
            scheduleRecompute();
            return;
          }
        }
      }

      prevNodes = state.nodes;
      prevEdges = state.edges;
    });
    recompute();
    return () => {
      unsubFlow();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);
}
