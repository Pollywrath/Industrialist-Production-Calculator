// Unified handling for all "Variable" values in the Industrialist app

/**
 * Check if a value is considered "variable"
 */
export const isVariable = (value) => {
  if (value === 'Variable' || value === 'variable') return true;
  if (typeof value === 'string' && value.toLowerCase().includes('variable')) return true;
  return false;
};

/**
 * Check if a product ID is the special variable product
 */
export const isVariableProduct = (productId) => {
  return productId === 'p_variableproduct';
};

/**
 * Get product name with special handling for variable products
 */
export const getProductName = (productId, getProductFn) => {
  if (isVariableProduct(productId)) {
    return 'Variable Product';
  }
  const product = getProductFn(productId);
  return product ? product.name : 'Unknown Product';
};

/**
 * Format quantity with special handling for variable quantities
 */
export const formatQuantity = (quantity) => {
  if (isVariable(quantity)) {
    return 'Variable';
  }
  if (typeof quantity === 'number') {
    return quantity.toString();
  }
  return quantity;
};

/**
 * Format cycle time with special handling
 */
export const formatCycleTime = (cycleTime) => {
  if (isVariable(cycleTime)) {
    return 'Variable';
  }
  if (typeof cycleTime === 'number') {
    return `${cycleTime}s`;
  }
  return cycleTime;
};

/**
 * Format power consumption with MF/s units and metric conversion
 * Handles both single values and objects with drilling/idle values (for mineshaft drill)
 * 1 MMF = 1,000,000 MF
 */
export const formatPowerConsumption = (power) => {
  if (isVariable(power)) {
    return 'Variable';
  }
  
  // Handle mineshaft drill with drilling/idle power (object)
  if (typeof power === 'object' && power !== null && 'drilling' in power && 'idle' in power) {
    const drillingFormatted = formatSinglePower(power.drilling);
    const idleFormatted = formatSinglePower(power.idle);
    return { drilling: drillingFormatted, idle: idleFormatted };
  }
  
  // Handle single power value
  return formatSinglePower(power);
};

/**
 * Helper function to format a single power value
 */
const formatSinglePower = (power) => {
  if (typeof power === 'string' && power.includes('Energy')) {
    return power;
  }
  if (typeof power === 'number') {
    // Convert to metric notation if >= 1 million
    if (power >= 1000000) {
      const mmf = power / 1000000;
      return `${mmf.toFixed(2)}MMF/s`;
    }
    // Convert to k notation if >= 1000
    if (power >= 1000) {
      const kmf = power / 1000;
      return `${kmf.toFixed(2)}kMF/s`;
    }
    return `${power}MF/s`;
  }
  return power;
};

/**
 * Format price with special handling for variable prices
 */
export const formatPrice = (price) => {
  if (isVariable(price)) {
    return 'Variable';
  }
  if (typeof price === 'number') {
    return `$${price}`;
  }
  return price;
};

/**
 * Format RP multiplier with special handling for variable values
 */
export const formatRPMultiplier = (rpMultiplier) => {
  if (isVariable(rpMultiplier)) {
    return 'Variable';
  }
  if (typeof rpMultiplier === 'number') {
    return `${rpMultiplier.toFixed(1)}x`;
  }
  return rpMultiplier;
};

/**
 * Format input/output for display in recipe lists
 * Returns a string like "5x Water" or "Variable x Variable Product"
 */
export const formatIngredient = (ingredient, getProductFn) => {
  const quantity = formatQuantity(ingredient.quantity);
  const productName = getProductName(ingredient.product_id, getProductFn);
  return `${quantity}x ${productName}`;
};

/**
 * Check if a recipe has any variable components
 */
export const hasVariableComponents = (recipe) => {
  // Check cycle time
  if (isVariable(recipe.cycle_time)) return true;
  
  // Check power consumption (handle both single value and object)
  if (typeof recipe.power_consumption === 'object' && recipe.power_consumption !== null) {
    if (isVariable(recipe.power_consumption.drilling) || isVariable(recipe.power_consumption.idle)) return true;
  } else if (isVariable(recipe.power_consumption)) {
    return true;
  }
  
  // Check inputs
  if (recipe.inputs.some(input => 
    isVariable(input.quantity) || isVariableProduct(input.product_id)
  )) return true;
  
  // Check outputs
  if (recipe.outputs.some(output => 
    isVariable(output.quantity) || isVariableProduct(output.product_id)
  )) return true;
  
  return false;
};

/**
 * Filter out variable products from a product list
 * Used during import/export to exclude special placeholders
 */
export const filterVariableProducts = (products) => {
  return products.filter(p => !isVariableProduct(p.id));
};

/**
 * Get display color for variable items (for UI consistency)
 */
export const getVariableColor = () => '#fbbf24'; // amber-400

/**
 * Check if two product IDs match, considering variable products
 * Variable products can connect to anything (wildcard)
 */
export const productsMatch = (productId1, productId2) => {
  // If either is variable, they match
  if (isVariableProduct(productId1) || isVariableProduct(productId2)) {
    return true;
  }
  // Otherwise, they must be identical
  return productId1 === productId2;
};