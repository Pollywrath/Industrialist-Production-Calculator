import { buildProductionGraph } from './graphBuilder';
import { calculateProductFlows } from './flowCalculator';
import { determineExcessAndDeficiency } from './excessCalculator';
import { propagateTemperatures, applyTemperaturesToNodes } from '../utils/temperaturePropagation';

export const solveProductionNetwork = (nodes, edges) => {
  const graph = buildProductionGraph(nodes, edges);
  const flows = calculateProductFlows(graph);
  
  // Propagate temperatures through the network
  const temperatureData = propagateTemperatures(graph, flows);
  
  // Apply temperatures back to nodes (this modifies the graph for cycle time calculations)
  const nodesWithTemperatures = applyTemperaturesToNodes(nodes, temperatureData, graph);
  
  // Rebuild graph with updated temperatures for accurate cycle times
  const updatedGraph = buildProductionGraph(nodesWithTemperatures, edges);
  const updatedFlows = calculateProductFlows(updatedGraph);
  
  // Re-propagate temperatures with the updated graph (in case cycle time changes affect flow distribution)
  const finalTemperatureData = propagateTemperatures(updatedGraph, updatedFlows);
  
  // Apply final temperatures to nodes
  const finalNodes = applyTemperaturesToNodes(nodesWithTemperatures, finalTemperatureData, updatedGraph);
  
  // Final graph build with all updates
  const finalGraph = buildProductionGraph(finalNodes, edges);
  const finalFlows = calculateProductFlows(finalGraph);
  
  const result = determineExcessAndDeficiency(finalGraph, finalFlows);
  return { ...result, graph: finalGraph, flows: finalFlows, temperatureData: finalTemperatureData };
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