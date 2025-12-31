import { buildProductionGraph } from './graphBuilder';
import { calculateProductFlows } from './flowCalculator';
import { determineExcessAndDeficiency } from './excessCalculator';
import { propagateTemperatures, applyTemperaturesToNodes } from '../utils/temperaturePropagation';
import { HEAT_SOURCES } from '../utils/temperatureHandler';
import { hasTempDependentCycle } from '../utils/temperatureDependentCycles';

export const solveProductionNetwork = (nodes, edges, options = {}) => {
  const { skipTemperature = false, previousTemperatureData = null } = options;
  
  // Build initial graph
  const graph = buildProductionGraph(nodes, edges);
  const flows = calculateProductFlows(graph);
  
  // If skipping temperature, use previous data or skip entirely
  if (skipTemperature) {
    const temperatureData = previousTemperatureData || { outputTemperatures: new Map(), inputTemperatures: new Map(), geothermalChains: new Map() };
    const result = determineExcessAndDeficiency(graph, flows);
    return { ...result, graph, flows, temperatureData };
  }
  
  // Check if any temperature-dependent nodes exist in the GRAPH
  const hasTemperatureDependentNodes = Object.values(graph.nodes).some(node => {
    const machineId = node.recipe.machine_id;
    return HEAT_SOURCES[machineId] || hasTempDependentCycle(machineId);
  });
  
  // If no temperature-dependent nodes, return immediately without propagation
  if (!hasTemperatureDependentNodes) {
    const temperatureData = { outputTemperatures: new Map(), inputTemperatures: new Map(), geothermalChains: new Map() };
    const result = determineExcessAndDeficiency(graph, flows);
    return { ...result, graph, flows, temperatureData };
  }
  
  // Propagate temperatures through the network
  const temperatureData = propagateTemperatures(graph, flows);
  
  // Apply temperatures to nodes
  const nodesWithTemperatures = applyTemperaturesToNodes(nodes, temperatureData, graph);
  
  // Check if temperatures actually changed anything significant
  const hasSignificantChange = nodesWithTemperatures.some((node, index) => {
    const originalNode = nodes[index];
    const originalTemp = originalNode.data?.recipe?.tempDependentInputTemp;
    const newTemp = node.data?.recipe?.tempDependentInputTemp;
    
    // Also check if output temperatures changed
    const originalOutputTemps = originalNode.data?.recipe?.outputs.map(o => o.temperature).filter(t => t !== undefined);
    const newOutputTemps = node.data?.recipe?.outputs.map(o => o.temperature).filter(t => t !== undefined);
    
    const inputTempChanged = Math.abs((originalTemp || 0) - (newTemp || 0)) > 0.1;
    const outputTempChanged = originalOutputTemps.length !== newOutputTemps.length ||
      originalOutputTemps.some((temp, i) => Math.abs((temp || 0) - (newOutputTemps[i] || 0)) > 0.1);
    
    return inputTempChanged || outputTempChanged;
  });
  
  // If no significant changes, return first-pass results
  if (!hasSignificantChange) {
    const result = determineExcessAndDeficiency(graph, flows);
    return { ...result, graph, flows, temperatureData };
  }
  
  // Rebuild graph with updated temperatures for accurate cycle times
  const updatedGraph = buildProductionGraph(nodesWithTemperatures, edges);
  const updatedFlows = calculateProductFlows(updatedGraph);
  
  // Re-propagate temperatures for final accuracy
  const finalTemperatureData = propagateTemperatures(updatedGraph, updatedFlows);
  
  // Apply final temperatures to nodes for display
  const finalNodesWithTemperatures = applyTemperaturesToNodes(nodesWithTemperatures, finalTemperatureData, updatedGraph);
  
  // Rebuild one final time with accurate temperatures
  const finalGraph = buildProductionGraph(finalNodesWithTemperatures, edges);
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