/**
 * Production Solver - Main Entry Point
 * 
 * This solver analyzes the production network and calculates:
 * 1. Excess products (surplus that can be sold)
 * 2. Deficient products (shortage that needs external supply)
 * 3. Product flows through the network
 * 
 * Handles complex scenarios:
 * - Multiple producers/consumers of the same product
 * - Partial connections (not all outputs consumed)
 * - Production loops/cycles
 * - Variable machine counts
 */

import { buildProductionGraph } from './graphBuilder';
import { calculateProductFlows } from './flowCalculator';
import { determineExcessAndDeficiency } from './excessCalculator';

/**
 * Solve the production network
 * @param {Array} nodes - Recipe box nodes from ReactFlow
 * @param {Array} edges - Connection edges from ReactFlow
 * @returns {Object} Solution with excess, deficiency, and flow data
 */
export const solveProductionNetwork = (nodes, edges) => {
  // Step 1: Build a graph representation of the production network
  // This creates a structured view of all producers, consumers, and connections
  const graph = buildProductionGraph(nodes, edges);
  
  // Step 2: Calculate how products flow through the network
  // This determines which outputs feed which inputs and in what quantities
  const flows = calculateProductFlows(graph);
  
  // Step 3: Determine excess and deficiency for each product
  // Excess = production exceeds consumption (can be sold)
  // Deficiency = consumption exceeds production (needs external supply)
  const result = determineExcessAndDeficiency(graph, flows);
  
  return {
    ...result,
    graph, // Include graph for debugging/visualization if needed
    flows  // Include flows for detailed analysis if needed
  };
};

/**
 * Get products that have excess production (can be sold)
 * @param {Object} solution - Solution from solveProductionNetwork
 * @returns {Array} Array of excess products with rates and profit potential
 */
export const getExcessProducts = (solution) => {
  return solution.excess || [];
};

/**
 * Get products that have insufficient production (need external supply)
 * @param {Object} solution - Solution from solveProductionNetwork
 * @returns {Array} Array of deficient products with shortage rates
 */
export const getDeficientProducts = (solution) => {
  return solution.deficiency || [];
};

/**
 * Calculate total profit from selling selected excess products
 * @param {Array} excessProducts - Array from getExcessProducts
 * @param {Object} soldProducts - Map of productId -> boolean (is sold)
 * @returns {number} Total profit per second
 */
export const calculateSoldProductsProfit = (excessProducts, soldProducts) => {
  let profit = 0;
  
  excessProducts.forEach(item => {
    if (soldProducts[item.productId] && typeof item.product.price === 'number') {
      profit += item.product.price * item.excessRate;
    }
  });
  
  return profit;
};