const STORAGE_CAPACITY = 7000;
const CONCRETE_BLOCKS_PER_FILL = 140;
const LEAD_INGOTS_PER_FILL = 70;
const POWER_CONSUMPTION = 1000000; // 1MMF/s
const MAX_FLOW_PER_INPUT = 240; // Max flow per any product input
const BASE_CYCLE_TIME = 29.166666666666668; // 7000 / 240
const MIN_FLOW_FOR_SCALING = 240;
const MAX_FLOW_FOR_SCALING = 480;

export const calculateWasteFacilityMetrics = (itemFlowRate, fluidFlowRate) => {
  const totalFlow = itemFlowRate + fluidFlowRate;
  
  // Calculate cycle time based on flow scaling:
  // <= 240/s: 100% cycle time (29.166666... seconds)
  // >= 480/s: 50% cycle time (14.583333... seconds)
  // Between 240-480: linear scaling based on flow rate
  let cycleTime;
  if (totalFlow <= MIN_FLOW_FOR_SCALING) {
    cycleTime = BASE_CYCLE_TIME;
  } else if (totalFlow >= MAX_FLOW_FOR_SCALING) {
    cycleTime = BASE_CYCLE_TIME / 2;
  } else {
    // Linear scaling: cycle time decreases as flow increases
    // Formula: 29.166666... * 240 / totalFlow
    cycleTime = BASE_CYCLE_TIME * MIN_FLOW_FOR_SCALING / totalFlow;
  }
  
  return {
    cycleTime,
    concreteBlocksPerCycle: CONCRETE_BLOCKS_PER_FILL,
    leadIngotsPerCycle: LEAD_INGOTS_PER_FILL,
    totalFlow,
    powerConsumption: POWER_CONSUMPTION
  };
};

export const buildWasteFacilityInputs = (itemFlowRate, fluidFlowRate, itemProductId, fluidProductId) => {
  // Cap flow rates at max per input
  const cappedItemFlow = Math.min(itemFlowRate, MAX_FLOW_PER_INPUT);
  const cappedFluidFlow = Math.min(fluidFlowRate, MAX_FLOW_PER_INPUT);
  const totalFlow = cappedItemFlow + cappedFluidFlow;
  
  // Calculate quantities based on flow scaling
  // At 240 or less: 7000
  // At 480 or more: 3500
  // In between: 7000 * 240 / totalFlow
  let itemQuantity, fluidQuantity;
  
  if (totalFlow <= MIN_FLOW_FOR_SCALING) {
    itemQuantity = STORAGE_CAPACITY;
    fluidQuantity = STORAGE_CAPACITY;
  } else if (totalFlow >= MAX_FLOW_FOR_SCALING) {
    itemQuantity = STORAGE_CAPACITY / 2;
    fluidQuantity = STORAGE_CAPACITY / 2;
  } else {
    itemQuantity = STORAGE_CAPACITY * MIN_FLOW_FOR_SCALING / totalFlow;
    fluidQuantity = STORAGE_CAPACITY * MIN_FLOW_FOR_SCALING / totalFlow;
  }
  
  const inputs = [
    { 
      product_id: itemProductId || 'p_variableproduct', 
      quantity: itemQuantity,
      isAnyProduct: itemProductId === 'p_any_item' || !itemProductId,
      acceptedType: 'item'
    },
    { 
      product_id: fluidProductId || 'p_variableproduct', 
      quantity: fluidQuantity,
      isAnyProduct: fluidProductId === 'p_any_fluid' || !fluidProductId,
      acceptedType: 'fluid'
    },
    { 
      product_id: 'p_concrete_block', 
      quantity: CONCRETE_BLOCKS_PER_FILL
    },
    { 
      product_id: 'p_lead_ingot', 
      quantity: LEAD_INGOTS_PER_FILL
    }
  ];
  
  return inputs;
};

export const DEFAULT_WASTE_FACILITY_RECIPE = {
  id: 'r_underground_waste_facility',
  name: 'Underground Waste Facility',
  machine_id: 'm_underground_waste_facility',
  cycle_time: 29.166666666666668,
  power_consumption: POWER_CONSUMPTION,
  pollution: 0,
  inputs: [
    { product_id: 'p_variableproduct', quantity: STORAGE_CAPACITY, isAnyProduct: true, acceptedType: 'item' },
    { product_id: 'p_variableproduct', quantity: STORAGE_CAPACITY, isAnyProduct: true, acceptedType: 'fluid' },
    { product_id: 'p_concrete_block', quantity: CONCRETE_BLOCKS_PER_FILL },
    { product_id: 'p_lead_ingot', quantity: LEAD_INGOTS_PER_FILL }
  ],
  outputs: [],
  isWasteFacility: true
};

export const MAX_INPUT_FLOW = MAX_FLOW_PER_INPUT;