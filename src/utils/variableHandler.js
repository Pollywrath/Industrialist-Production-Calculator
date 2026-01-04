const isVariable = (value) => value === 'Variable' || (typeof value === 'string' && value.toLowerCase().includes('variable'));
const isVariableProduct = (productId) => productId === 'p_variableproduct';

export const getProductName = (productId, getProductFn, acceptedType) => {
  if (isVariableProduct(productId)) {
    if (acceptedType === 'item') return 'Variable Item';
    if (acceptedType === 'fluid') return 'Variable Fluid';
    return 'Variable Product';
  }
  if (productId === 'p_any_item') return 'Variable Item';
  if (productId === 'p_any_fluid') return 'Variable Fluid';
  const product = getProductFn(productId);
  return product ? product.name : 'Unknown Product';
};

export const formatQuantity = (quantity) => isVariable(quantity) ? 'Variable' : (typeof quantity === 'number' ? quantity.toString() : quantity);

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

const formatSinglePower = (power) => {
  if (typeof power === 'number') {
    if (power >= 1000000) return `${(power / 1000000).toFixed(2)}MMF/s`;
    if (power >= 1000) return `${(power / 1000).toFixed(2)}kMF/s`;
    return `${power.toFixed(2)}MF/s`;
  }
  return power;
};

export const formatPowerConsumption = (power) => {
  if (isVariable(power)) return 'Variable';
  if (typeof power === 'object' && power !== null) {
    if ('drilling' in power && 'idle' in power) {
      return { drilling: formatSinglePower(power.drilling), idle: formatSinglePower(power.idle) };
    }
    if ('max' in power && 'average' in power) {
      return { max: formatSinglePower(power.max), average: formatSinglePower(power.average) };
    }
  }
  return formatSinglePower(power);
};

export const formatPollution = (pollution) => {
  if (isVariable(pollution)) return 'Variable';
  if (typeof pollution === 'number') return `${pollution.toFixed(3)}%/hr`;
  if (typeof pollution === 'string') return pollution.includes('%') ? pollution : `${pollution}%/hr`;
  return pollution;
};

export const formatPrice = (price) => isVariable(price) ? 'Variable' : (typeof price === 'number' ? `$${price}` : price);

export const formatRPMultiplier = (rpMultiplier) => 
  isVariable(rpMultiplier) ? 'Variable' : (typeof rpMultiplier === 'number' ? `${rpMultiplier.toFixed(1)}x` : rpMultiplier);

export const formatIngredient = (ingredient, getProductFn) => {
  const quantity = formatQuantity(ingredient.quantity);
  const productName = getProductName(ingredient.product_id, getProductFn);
  return `${quantity}x ${productName}`;
};

export const filterVariableProducts = (products) => products.filter(p => !isVariableProduct(p.id));

export const productsMatch = (productId1, productId2) => {
  if (isVariableProduct(productId1) || isVariableProduct(productId2)) return true;
  return productId1 === productId2;
};