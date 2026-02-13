import { computeMachines } from './lpSolver.js';
import { updateMachines } from '../data/dataLoader.js';

self.onmessage = (e) => {
  const { nodes, edges, targetProducts, activeWeights, unusedWeights, machines } = e.data;

  // Sync the live machines data from the main thread so getMachine() works correctly
  updateMachines(machines);

  // First pass: strict — no deficiency allowed
  const result = computeMachines(nodes, edges, targetProducts, {
    allowDeficiency: false,
    activeWeights,
    unusedWeights
  });

  // If deficiency detected, run a second permissive pass so the main thread
  // can apply it immediately if the user confirms — no second round-trip needed
  let deficiencyResult = null;
  if (!result.success && result.hasDeficiency) {
    deficiencyResult = computeMachines(nodes, edges, targetProducts, {
      allowDeficiency: true,
      activeWeights,
      unusedWeights
    });
  }

  self.postMessage({ result, deficiencyResult });
};