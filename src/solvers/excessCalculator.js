import { getProduct } from '../data/dataLoader';

export const determineExcessAndDeficiency = (graph, flows) => {
  const excess = [];
  const deficiency = [];
  const THRESHOLD = 0.0001;

  Object.keys(graph.products).forEach(productId => {
    const productData = graph.products[productId];
    const flowData = flows.byProduct[productId];
    if (!flowData) return;

    const totalProduction = flowData.totalProduction;
    const connectedConsumption = flowData.connectedFlow;
    const excessAmount = totalProduction - connectedConsumption;

    if (excessAmount !== 0 && excessAmount > 0) {
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
        if (shortage !== 0 && shortage > 0) {
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

  return { excess, deficiency };
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