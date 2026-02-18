import { computeMachines } from './lpSolver.js';
import { updateMachines } from '../data/dataLoader.js';


self.onmessage = async (e) => {
  console.log('[LP Worker] Worker script loaded');

  try {
    const { nodes, edges, targetProducts, activeWeights, unusedWeights, machines } = e.data;

    console.log('[LP Worker] Starting computation...');

    // Sync the live machines data from the main thread so getMachine() works correctly
    updateMachines(machines);

    // First pass: strict – no deficiency allowed
    console.log('[LP Worker] Running first pass (strict)...');
    const result = await computeMachines(nodes, edges, targetProducts, {
      allowDeficiency: false,
      activeWeights,
      unusedWeights
    });

    // If deficiency detected, run a second permissive pass so the main thread
    // can apply it immediately if the user confirms – no second round-trip needed
    let deficiencyResult = null;
    if (!result.success && result.hasDeficiency) {
      console.log('[LP Worker] Running second pass (permissive)...');
      deficiencyResult = await computeMachines(nodes, edges, targetProducts, {
        allowDeficiency: true,
        activeWeights,
        unusedWeights
      });
    }

    console.log('[LP Worker] Computation complete, sending results...');
    self.postMessage({ result, deficiencyResult });
  } catch (error) {
    console.error('[LP Worker] Fatal error:', error);
    console.error('[LP Worker] Error stack:', error.stack);
    console.error('[LP Worker] Error name:', error.name);
    console.error('[LP Worker] Error message:', error.message);
    self.postMessage({ 
      result: { 
        success: false, 
        error: error.message,
        stack: error.stack,
        name: error.name
      }, 
      deficiencyResult: null 
    });
  }
};

// Add global error handler for worker
self.onerror = (event) => {
  console.error('[LP Worker] Global error:', event);
  console.error('[LP Worker] Error message:', event.message);
  console.error('[LP Worker] Error filename:', event.filename);
  console.error('[LP Worker] Error line:', event.lineno);
  console.error('[LP Worker] Error column:', event.colno);
  console.error('[LP Worker] Error object:', event.error);
};