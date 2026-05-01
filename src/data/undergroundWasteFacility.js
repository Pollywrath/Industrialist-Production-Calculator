const STORAGE_CAPACITY = 7000;
const CONCRETE_BLOCKS_PER_FILL = 140;
const LEAD_INGOTS_PER_FILL = 70;
const POWER_CONSUMPTION = 1000000; // 1MMF/s
const MAX_FLOW_PER_INPUT = 240; // Max flow per machine per waste input

/**
 * Calculate metrics for the Underground Waste Facility.
 *
 * The machine always uses cycle_time = 1 (all quantities are per-second rates).
 * Concrete and lead consumption rates are derived from how fast the 7000-unit
 * storage fills:
 *
 *   fillsPerSecond     = totalFlow / 7000
 *   concretePerSecond  = 140 * fillsPerSecond
 *   leadPerSecond      =  70 * fillsPerSecond
 *
 * At 240/s total:  concrete ≈ 4.8/s,  lead ≈ 2.4/s
 * At 480/s total:  concrete ≈ 9.6/s,  lead ≈ 4.8/s
 */
export const calculateWasteFacilityMetrics = (itemFlowRate, fluidFlowRate) => {
  const totalFlow = itemFlowRate + fluidFlowRate;

  const fillsPerSecond    = totalFlow / STORAGE_CAPACITY;
  const concretePerSecond = CONCRETE_BLOCKS_PER_FILL * fillsPerSecond;
  const leadPerSecond     = LEAD_INGOTS_PER_FILL      * fillsPerSecond;

  return {
    cycleTime: 1,
    concreteBlocksPerCycle: concretePerSecond,  // per-second rate when cycleTime=1
    leadIngotsPerCycle:     leadPerSecond,
    totalFlow,
    powerConsumption: POWER_CONSUMPTION
  };
};

/**
 * Build the input array for the Underground Waste Facility.
 *
 * Inputs 0 & 1 (waste sinks):
 *   - quantity = actual connected flow in /s  (shown on the handle)
 *   - maxFlow  = 240 * machineCount           (hard cap per machine)
 *   - isSink   = true  -> no deficiency generated, excess fires if over cap
 *   - acceptedType enforces item / fluid
 *
 * Inputs 2 & 3 (concrete blocks, lead ingots):
 *   - quantity = per-second consumption rate derived from fill speed
 *   - cycle_time is 1, so rate = quantity directly
 */
export const buildWasteFacilityInputs = (itemFlowRate, fluidFlowRate, itemProductId, fluidProductId, machineCount = 1) => {
  const maxFlowPerInput = MAX_FLOW_PER_INPUT * machineCount;
  const cappedItemFlow  = Math.min(itemFlowRate,  maxFlowPerInput);
  const cappedFluidFlow = Math.min(fluidFlowRate, maxFlowPerInput);
  const totalFlow = cappedItemFlow + cappedFluidFlow;

  const fillsPerSecond    = totalFlow / STORAGE_CAPACITY;
  const concretePerSecond = CONCRETE_BLOCKS_PER_FILL * fillsPerSecond;
  const leadPerSecond     = LEAD_INGOTS_PER_FILL      * fillsPerSecond;

  return [
    {
      product_id: itemProductId || 'p_variableproduct',
      quantity: cappedItemFlow,                        // per-second flow
      isAnyProduct: !itemProductId || itemProductId === 'p_any_item' || itemProductId === 'p_variableproduct',
      acceptedType: 'item',
      maxFlow: maxFlowPerInput,
      isSink: true
    },
    {
      product_id: fluidProductId || 'p_variableproduct',
      quantity: cappedFluidFlow,                       // per-second flow
      isAnyProduct: !fluidProductId || fluidProductId === 'p_any_fluid' || fluidProductId === 'p_variableproduct',
      acceptedType: 'fluid',
      maxFlow: maxFlowPerInput,
      isSink: true
    },
    {
      product_id: 'p_concrete_block',
      quantity: concretePerSecond                      // per-second consumption rate
    },
    {
      product_id: 'p_lead_ingot',
      quantity: leadPerSecond                          // per-second consumption rate
    }
  ];
};

export const DEFAULT_WASTE_FACILITY_RECIPE = {
  id: 'r_underground_waste_facility',
  name: 'Underground Waste Facility',
  machine_id: 'm_underground_waste_facility',
  cycle_time: 1,
  power_consumption: POWER_CONSUMPTION,
  power_type: 'MV',
  pollution: 0,
  inputs: [
    { product_id: 'p_variableproduct', quantity: 0, isAnyProduct: true, acceptedType: 'item',  maxFlow: MAX_FLOW_PER_INPUT, isSink: true },
    { product_id: 'p_variableproduct', quantity: 0, isAnyProduct: true, acceptedType: 'fluid', maxFlow: MAX_FLOW_PER_INPUT, isSink: true },
    { product_id: 'p_concrete_block',  quantity: 0 },
    { product_id: 'p_lead_ingot',      quantity: 0 }
  ],
  outputs: [],
  isWasteFacility: true
};

export const MAX_INPUT_FLOW = MAX_FLOW_PER_INPUT;