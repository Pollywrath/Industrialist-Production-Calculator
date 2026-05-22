import { create } from 'zustand';
import type { FlowResults, NodeFlowResult } from '../types/solver';

interface FlowResultState {
  results: FlowResults;
  edgeFlows: Record<string, number>;
  edgeTemps: Record<string, number>;
  inputTemps: Record<string, Record<number, number>>;
  setResults: (
    results: FlowResults,
    edgeFlows: Record<string, number>,
    edgeTemps: Record<string, number>,
    inputTemps: Record<string, Record<number, number>>,
  ) => void;
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

function areRecordsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function areInputTempsEqual(
  a: Record<string, Record<number, number>>,
  b: Record<string, Record<number, number>>,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i];
    const subA = a[key];
    const subB = b[key];
    if (!subA || !subB) return false;
    const subKeysA = Object.keys(subA);
    const subKeysB = Object.keys(subB);
    if (subKeysA.length !== subKeysB.length) return false;
    for (let j = 0; j < subKeysA.length; j++) {
      const subKey = subKeysA[j];
      const idx = Number(subKey);
      if (subA[idx] !== subB[idx]) return false;
    }
  }
  return true;
}

const useFlowResultStore = create<FlowResultState>((set, get) => ({
  results: new Map(),
  edgeFlows: {},
  edgeTemps: {},
  inputTemps: {},
  setResults: (newResults, newEdgeFlows, newEdgeTemps, newInputTemps) => {
    const oldState = get();
    const oldResults = oldState.results;
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

    const edgeFlowsChanged = !areRecordsEqual(oldState.edgeFlows, newEdgeFlows);
    const edgeTempsChanged = !areRecordsEqual(oldState.edgeTemps, newEdgeTemps);
    const inputTempsChanged = !areInputTempsEqual(oldState.inputTemps, newInputTemps);

    if (hasChanged || edgeFlowsChanged || edgeTempsChanged || inputTempsChanged) {
      set({
        results: updatedResults,
        edgeFlows: newEdgeFlows,
        edgeTemps: newEdgeTemps,
        inputTemps: newInputTemps,
      });
    }
  },
}));

export { useFlowResultStore };
