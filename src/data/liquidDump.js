const MAX_FLOW_PER_INPUT = 15; // 15/s per input
const INPUT_COUNT = 2;

const WATER_VARIANTS = [
  'p_water', 
  'p_filtered_water', 
  'p_distilled_water', 
  'p_steam', 
  'p_low_pressure_steam', 
  'p_high_pressure_steam'
];

export const calculateLiquidDumpPollution = (fluidInputs, flowRates = null) => {
  let totalPollution = 0;
  
  fluidInputs.forEach((input, index) => {
    if (!input.product_id || input.product_id === 'p_any_fluid') return;
    
    // Use actual flow rate if provided, otherwise use max capacity
    const flowRate = flowRates && flowRates[index] !== undefined ? flowRates[index] : (input.quantity || 0);
    
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

export const buildLiquidDumpInputs = (fluidProductIds) => {
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

export const DEFAULT_LIQUID_DUMP_RECIPE = {
  id: 'r_liquid_dump',
  name: 'Liquid Dump',
  machine_id: 'm_liquid_dump',
  cycle_time: 1,
  power_consumption: 0,
  pollution: 0, // Calculated dynamically
  inputs: [
    { product_id: 'p_variableproduct', quantity: 15, isAnyProduct: true, acceptedType: 'fluid', maxFlow: MAX_FLOW_PER_INPUT },
    { product_id: 'p_variableproduct', quantity: 15, isAnyProduct: true, acceptedType: 'fluid', maxFlow: MAX_FLOW_PER_INPUT }
  ],
  outputs: [],
  isLiquidDump: true
};

export const MAX_INPUT_FLOW = MAX_FLOW_PER_INPUT;