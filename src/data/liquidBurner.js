const MAX_FLOW_PER_INPUT = 15; // 15/s per input
const INPUT_COUNT = 8;

const WATER_VARIANTS = [
  'p_water', 
  'p_filtered_water', 
  'p_distilled_water', 
  'p_steam', 
  'p_low_pressure_steam', 
  'p_high_pressure_steam'
];

export const calculateLiquidBurnerPollution = (fluidInputs) => {
  let totalPollution = 0;
  
  fluidInputs.forEach(input => {
    if (!input.product_id || input.product_id === 'p_any_fluid') return;
    
    const flowRate = input.quantity || 0;
    
    if (WATER_VARIANTS.includes(input.product_id)) {
      // Water variants: 0 pollution
      totalPollution += 0;
    } else if (input.product_id === 'p_residue') {
      // Residue: 8.64/hr per residue/s
      totalPollution += 8.64 * flowRate;
    } else {
      // Everything else: 0.0216/hr per fluid/s
      totalPollution += 0.0216 * flowRate;
    }
  });
  
  return totalPollution;
};

export const buildLiquidBurnerInputs = (fluidProductIds) => {
  const inputs = [];
  
  for (let i = 0; i < INPUT_COUNT; i++) {
    const productId = fluidProductIds?.[i] || 'p_variableproduct';
    inputs.push({
      product_id: productId,
      quantity: 15,
      isAnyProduct: productId === 'p_any_fluid' || productId === 'p_variableproduct',
      acceptedType: 'fluid',
      maxFlow: MAX_FLOW_PER_INPUT
    });
  }
  
  return inputs;
};

export const DEFAULT_LIQUID_BURNER_RECIPE = {
  id: 'r_liquid_burner',
  name: 'Liquid Burner',
  machine_id: 'm_liquid_burner',
  cycle_time: 1,
  power_consumption: 0,
  pollution: 0, // Calculated dynamically
  inputs: Array(INPUT_COUNT).fill(null).map(() => ({
    product_id: 'p_variableproduct',
    quantity: 15,
    isAnyProduct: true,
    acceptedType: 'fluid',
    maxFlow: MAX_FLOW_PER_INPUT
  })),
  outputs: [],
  isLiquidBurner: true
};

export const MAX_INPUT_FLOW = MAX_FLOW_PER_INPUT;