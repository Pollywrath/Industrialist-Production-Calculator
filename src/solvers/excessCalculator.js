import { getProduct } from '../data/dataLoader';

import { calculateSuggestions } from './suggestionCalculator';

export const determineExcessAndDeficiency = (graph, flows) => {
  const excess = [];
  const deficiency = [];
  // Use 15 decimal precision - only consider real excess/deficiency if > epsilon
  const EPSILON = 1e-15;

  Object.keys(graph.products).forEach(productId => {
    const productData = graph.products[productId];
    const flowData = flows.byProduct[productId];
    if (!flowData) return;

    const totalProduction = flowData.totalProduction;
    const connectedConsumption = flowData.connectedFlow;
    const excessAmount = totalProduction - connectedConsumption;

    // Only consider excess if difference is truly > epsilon (not just floating point error)
    if (Math.abs(excessAmount) > EPSILON && excessAmount > 0) {
      const product = getProduct(productId);
      if (product) {
        excess.push({
          productId,
          product,
          excessRate: excessAmount,
          totalProduction,
          connectedConsumption,
          percentageExcess: totalProduction > 0 ? (excessAmount / totalProduction) * 100 : 0
        });
      }
    }

    productData.consumers.forEach(consumer => {
      const inputFlow = flows.byNode[consumer.nodeId]?.inputFlows[consumer.inputIndex];
      if (inputFlow) {
        const shortage = inputFlow.needed - inputFlow.connected;
        // Only consider deficiency if difference is truly > epsilon (not just floating point error)
        if (Math.abs(shortage) > EPSILON && shortage > 0) {
          const product = getProduct(productId);
          if (product) {
            let existingDeficiency = deficiency.find(d => d.productId === productId);
            if (existingDeficiency) {
              existingDeficiency.deficiencyRate += shortage;
              existingDeficiency.affectedNodes.push({ 
                nodeId: consumer.nodeId, 
                inputIndex: consumer.inputIndex, 
                shortage 
              });
            } else {
              deficiency.push({
                productId,
                product,
                deficiencyRate: shortage,
                totalConsumption: flowData.totalConsumption,
                connectedProduction: connectedConsumption,
                percentageDeficient: flowData.totalConsumption > 0 ? (shortage / flowData.totalConsumption) * 100 : 0,
                affectedNodes: [{ nodeId: consumer.nodeId, inputIndex: consumer.inputIndex, shortage }]
              });
            }
          }
        }
      }
    });
  });

  excess.sort((a, b) => b.excessRate - a.excessRate);
  deficiency.sort((a, b) => b.deficiencyRate - a.deficiencyRate);

  // Calculate suggestions only if there's excess or deficiency
  const suggestions = (excess.length > 0 || deficiency.length > 0) 
    ? calculateSuggestions(graph, flows)
    : [];

  return { excess, deficiency, suggestions };
};

export const getProductExcess = (excessProducts, productId) => 
  excessProducts.find(item => item.productId === productId) || null;

export const getProductDeficiency = (deficientProducts, productId) => 
  deficientProducts.find(item => item.productId === productId) || null;

export const isProductBalanced = (excessProducts, deficientProducts, productId) => {
  const hasExcess = excessProducts.some(item => item.productId === productId);
  const hasDeficiency = deficientProducts.some(item => item.productId === productId);
  return !hasExcess && !hasDeficiency;
};

export const getNetworkSummary = (excessProducts, deficientProducts) => {
  const deficiencyPenalty = deficientProducts.length * 15;
  const excessPenalty = excessProducts.length * 5;
  const healthScore = Math.max(0, 100 - deficiencyPenalty - excessPenalty);

  return {
    totalExcessProducts: excessProducts.length,
    totalDeficientProducts: deficientProducts.length,
    totalExcessValue: excessProducts.reduce((sum, item) => {
      const price = typeof item.product.price === 'number' ? item.product.price : 0;
      return sum + (price * item.excessRate);
    }, 0),
    healthScore
  };
};