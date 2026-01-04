/**
 * Compute Machines Solver
 * Automatically adjusts machine counts to balance production for target recipes
 */

import { buildProductionGraph } from './graphBuilder';
import { solveFullGraph, extractMachineUpdates } from './lpSolver';

/**
 * Compute Machines Solver (LP-Based)
 * Uses Linear Programming to find optimal machine counts
 */

/**
 * Main compute function - adjusts machine counts to balance production
 */
export const computeMachines = (nodes, edges, targetProducts) => {
  if (targetProducts.length === 0) {
    return {
      success: false,
      updates: new Map(),
      converged: false,
      iterations: 0,
      message: 'No target recipes selected'
    };
  }

  // Build graph
  const graph = buildProductionGraph(nodes, edges);
  const targetNodeIds = new Set(targetProducts.map(t => t.recipeBoxId));
  
  // Solve with LP (this will log debug info to console automatically)
  const lpResult = solveFullGraph(graph, targetNodeIds);
  
  if (!lpResult.feasible) {
    return {
      success: false,
      updates: new Map(),
      converged: false,
      iterations: 0,
      message: 'No feasible solution found (infeasible constraints)'
    };
  }
  
  // Extract updates (this will also log debug info)
  const updates = extractMachineUpdates(lpResult, graph);
  
  return {
    success: updates.size > 0,
    updates,
    converged: true,
    iterations: 1,
    message: updates.size > 0 ? `Updated ${updates.size} nodes` : 'Network already balanced'
  };
};