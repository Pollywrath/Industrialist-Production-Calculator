import { create } from 'zustand';
import type { FlowResults, NodeFlowResult } from '../types/solver';

interface FlowResultState {
  results: FlowResults;
  setResults: (results: FlowResults) => void;
}

function areFlowResultsEqual(a: NodeFlowResult, b: NodeFlowResult): boolean {
  if (a.inputFlows.length !== b.inputFlows.length) return false;
  if (a.outputFlows.length !== b.outputFlows.length) return false;

  for (let i = 0; i < a.inputFlows.length; i++) {
    const fA = a.inputFlows[i];
    const fB = b.inputFlows[i];
    if (
      fA.rate !== fB.rate ||
      fA.connected !== fB.connected ||
      fA.hasDeficiency !== fB.hasDeficiency ||
      fA.hasExcess !== fB.hasExcess
    ) {
      return false;
    }
  }

  for (let i = 0; i < a.outputFlows.length; i++) {
    const fA = a.outputFlows[i];
    const fB = b.outputFlows[i];
    if (
      fA.rate !== fB.rate ||
      fA.connected !== fB.connected ||
      fA.hasDeficiency !== fB.hasDeficiency ||
      fA.hasExcess !== fB.hasExcess
    ) {
      return false;
    }
  }

  return true;
}

const useFlowResultStore = create<FlowResultState>((set, get) => ({
  results: new Map(),
  setResults: (newResults) => {
    const oldResults = get().results;
    let hasChanged = oldResults.size !== newResults.size;
    const updatedResults = new Map<string, NodeFlowResult>();

    newResults.forEach((newVal, nodeId) => {
      const oldVal = oldResults.get(nodeId);
      if (oldVal && areFlowResultsEqual(oldVal, newVal)) {
        updatedResults.set(nodeId, oldVal);
      } else {
        updatedResults.set(nodeId, newVal);
        hasChanged = true;
      }
    });

    if (hasChanged) {
      set({ results: updatedResults });
    }
  },
}));

export { useFlowResultStore };
