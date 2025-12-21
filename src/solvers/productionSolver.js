import { buildProductionGraph } from './graphBuilder';
import { calculateProductFlows } from './flowCalculator';
import { determineExcessAndDeficiency } from './excessCalculator';

export const solveProductionNetwork = (nodes, edges) => {
  const graph = buildProductionGraph(nodes, edges);
  const flows = calculateProductFlows(graph);
  const result = determineExcessAndDeficiency(graph, flows);
  return { ...result, graph, flows };
};

export const getExcessProducts = (solution) => solution.excess || [];
export const getDeficientProducts = (solution) => solution.deficiency || [];

export const calculateSoldProductsProfit = (excessProducts, soldProducts) => {
  let profit = 0;
  excessProducts.forEach(item => {
    if (soldProducts[item.productId] && typeof item.product.price === 'number') {
      profit += item.product.price * item.excessRate;
    }
  });
  return profit;
};