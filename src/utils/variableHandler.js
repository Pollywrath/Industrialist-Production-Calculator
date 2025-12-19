/**
 * Unified handling for "Variable" values throughout the app
 * Used when exact quantities are not yet calculated (e.g., unconfigured drill)
 */

// Check if value is "Variable" (case-insensitive)
const isVariable = (value) => 
  value === 'Variable' || 
  (typeof value === 'string' && value.toLowerCase().includes('variable'));

// Check if product ID is the special variable product placeholder
const isVariableProduct = (productId) => productId === 'p_variableproduct';

/**
 * Get product name with fallback for variable products
 */
export const getProductName = (productId, getProductFn) => {
  if (isVariableProduct(productId)) return 'Variable Product';
  const product = getProductFn(productId);
  return product ? product.name : 'Unknown Product';
};

/**
 * Format quantity for display - handles numbers and "Variable"
 */
export const formatQuantity = (quantity) => {
  if (isVariable(quantity)) return 'Variable';
  return typeof quantity === 'number' ? quantity.toString() : quantity;
};

/**
 * Format cycle time - add seconds unit if numeric
 * Converts to m:s format if >= 60 seconds
 */
export const formatCycleTime = (cycleTime) => {
  if (isVariable(cycleTime)) return 'Variable';
  
  if (typeof cycleTime === 'number') {
    if (cycleTime >= 60) {
      const minutes = Math.floor(cycleTime / 60);
      const seconds = cycleTime % 60;
      return `${minutes}m ${seconds.toFixed(1)}s`;
    }
    return `${cycleTime.toFixed(1)}s`;
  }
  return cycleTime;
};

/**
 * Format power consumption - handles:
 * - Single values (basic recipes)
 * - Drilling/Idle objects (mineshaft drill)
 * - Max/Average objects (logic assembler)
 */
export const formatPowerConsumption = (power) => {
  if (isVariable(power)) return 'Variable';
  
  // Handle dual power values with different keys - return formatted object
  if (typeof power === 'object' && power !== null) {
    if ('drilling' in power && 'idle' in power) {
      return { 
        drilling: formatSinglePower(power.drilling), 
        idle: formatSinglePower(power.idle) 
      };
    }
    if ('max' in power && 'average' in power) {
      return { 
        max: formatSinglePower(power.max), 
        average: formatSinglePower(power.average) 
      };
    }
  }
  
  return formatSinglePower(power);
};

/**
 * Convert single power value to metric notation (MMF/s, kMF/s, or MF/s)
 */
const formatSinglePower = (power) => {
  if (typeof power === 'number') {
    if (power >= 1000000) return `${(power / 1000000).toFixed(2)}MMF/s`;
    if (power >= 1000) return `${(power / 1000).toFixed(2)}kMF/s`;
    return `${power.toFixed(2)}MF/s`;
  }
  return power;
};

/**
 * Format pollution - ensure it displays as percentage per hour
 */
export const formatPollution = (pollution) => {
  if (isVariable(pollution)) return 'Variable';
  
  if (typeof pollution === 'number') {
    return `${pollution}%/hr`;
  }
  
  if (typeof pollution === 'string') {
    // If it already has the format, return as-is
    if (pollution.includes('%')) return pollution;
    // Otherwise add the format
    return `${pollution}%/hr`;
  }
  
  return pollution;
};

/**
 * Format price with dollar sign
 */
export const formatPrice = (price) => {
  if (isVariable(price)) return 'Variable';
  return typeof price === 'number' ? `$${price}` : price;
};

/**
 * Format RP multiplier with 'x' suffix
 */
export const formatRPMultiplier = (rpMultiplier) => {
  if (isVariable(rpMultiplier)) return 'Variable';
  return typeof rpMultiplier === 'number' ? `${rpMultiplier.toFixed(1)}x` : rpMultiplier;
};

/**
 * Format ingredient for recipe display (e.g., "5x Water")
 */
export const formatIngredient = (ingredient, getProductFn) => {
  const quantity = formatQuantity(ingredient.quantity);
  const productName = getProductName(ingredient.product_id, getProductFn);
  return `${quantity}x ${productName}`;
};

/**
 * Filter out variable product placeholders from import/export
 * Prevents dummy data from being saved to files
 */
export const filterVariableProducts = (products) => 
  products.filter(p => !isVariableProduct(p.id));

/**
 * Check if two product IDs match
 * Variable products can connect to anything (wildcards)
 */
export const productsMatch = (productId1, productId2) => {
  if (isVariableProduct(productId1) || isVariableProduct(productId2)) return true;
  return productId1 === productId2;
};