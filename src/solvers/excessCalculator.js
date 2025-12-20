/**
 * Excess Calculator - Determine which products have surplus or shortage
 * 
 * Calculates:
 * - Excess: Production exceeds connected consumption (can be sold)
 * - Deficiency: Consumption exceeds connected production (needs external supply)
 * 
 * Key insight: Only count connected flows, not total production/consumption
 * Example: If a product is produced but not connected, it's 100% excess
 */

import { getProduct } from '../data/dataLoader';

/**
 * Determine excess and deficiency for all products
 * @param {Object} graph - Production graph
 * @param {Object} flows - Flow data from calculateProductFlows
 * @returns {Object} { excess: [], deficiency: [] }
 */
export const determineExcessAndDeficiency = (graph, flows) => {
  const excess = [];
  const deficiency = [];

  Object.keys(graph.products).forEach(productId => {
    const productData = graph.products[productId];
    const flowData = flows.byProduct[productId];

    if (!flowData) return;

    // Calculate total production and connected consumption
    const totalProduction = flowData.totalProduction;
    const connectedConsumption = flowData.connectedFlow;

    // Excess = production not consumed via connections
    const excessAmount = totalProduction - connectedConsumption;

    if (excessAmount > 0.0001) { // Small threshold for floating point errors
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

    // For deficiency, we need to check each consumer individually
    // A consumer is deficient if its needed input > connected flow
    productData.consumers.forEach(consumer => {
      const nodeId = consumer.nodeId;
      const inputIndex = consumer.inputIndex;
      const inputFlow = flows.byNode[nodeId]?.inputFlows[inputIndex];

      if (inputFlow) {
        const shortage = inputFlow.needed - inputFlow.connected;
        
        if (shortage > 0.0001) {
          const product = getProduct(productId);
          if (product) {
            // Check if already added to deficiency list
            let existingDeficiency = deficiency.find(d => d.productId === productId);
            
            if (existingDeficiency) {
              existingDeficiency.deficiencyRate += shortage;
              existingDeficiency.affectedNodes.push({
                nodeId,
                inputIndex,
                shortage
              });
            } else {
              deficiency.push({
                productId,
                product,
                deficiencyRate: shortage,
                totalConsumption: flowData.totalConsumption,
                connectedProduction: connectedConsumption,
                percentageDeficient: flowData.totalConsumption > 0 
                  ? (shortage / flowData.totalConsumption) * 100 
                  : 0,
                affectedNodes: [{
                  nodeId,
                  inputIndex,
                  shortage
                }]
              });
            }
          }
        }
      }
    });
  });

  // Sort by rate (highest first)
  excess.sort((a, b) => b.excessRate - a.excessRate);
  deficiency.sort((a, b) => b.deficiencyRate - a.deficiencyRate);

  return { excess, deficiency };
};

/**
 * Get excess for a specific product
 * @param {Array} excessProducts - Array from determineExcessAndDeficiency
 * @param {string} productId - Product ID
 * @returns {Object|null} Excess data or null if not excess
 */
export const getProductExcess = (excessProducts, productId) => {
  return excessProducts.find(item => item.productId === productId) || null;
};

/**
 * Get deficiency for a specific product
 * @param {Array} deficientProducts - Array from determineExcessAndDeficiency
 * @param {string} productId - Product ID
 * @returns {Object|null} Deficiency data or null if not deficient
 */
export const getProductDeficiency = (deficientProducts, productId) => {
  return deficientProducts.find(item => item.productId === productId) || null;
};

/**
 * Check if a product is balanced (production matches consumption)
 * @param {Array} excessProducts - Array from determineExcessAndDeficiency
 * @param {Array} deficientProducts - Array from determineExcessAndDeficiency
 * @param {string} productId - Product ID
 * @returns {boolean} True if balanced (no excess or deficiency)
 */
export const isProductBalanced = (excessProducts, deficientProducts, productId) => {
  const hasExcess = excessProducts.some(item => item.productId === productId);
  const hasDeficiency = deficientProducts.some(item => item.productId === productId);
  return !hasExcess && !hasDeficiency;
};

/**
 * Get summary statistics for the production network
 * @param {Array} excessProducts - Array from determineExcessAndDeficiency
 * @param {Array} deficientProducts - Array from determineExcessAndDeficiency
 * @returns {Object} Summary stats
 */
export const getNetworkSummary = (excessProducts, deficientProducts) => {
  return {
    totalExcessProducts: excessProducts.length,
    totalDeficientProducts: deficientProducts.length,
    totalExcessValue: excessProducts.reduce((sum, item) => {
      const price = typeof item.product.price === 'number' ? item.product.price : 0;
      return sum + (price * item.excessRate);
    }, 0),
    healthScore: calculateHealthScore(excessProducts, deficientProducts)
  };
};

/**
 * Calculate a "health score" for the production network
 * @param {Array} excessProducts - Excess products
 * @param {Array} deficientProducts - Deficient products
 * @returns {number} Score from 0-100 (100 = perfectly balanced)
 */
const calculateHealthScore = (excessProducts, deficientProducts) => {
  // Perfect balance = 100
  // Each deficiency reduces score more than excess (deficiency is worse)
  const deficiencyPenalty = deficientProducts.length * 15;
  const excessPenalty = excessProducts.length * 5;
  
  return Math.max(0, 100 - deficiencyPenalty - excessPenalty);
};