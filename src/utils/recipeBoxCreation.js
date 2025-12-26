import { getMachine, getProduct } from '../data/dataLoader';
import { calculateOutputTemperature, DEFAULT_BOILER_INPUT_TEMPERATURE, DEFAULT_WATER_TEMPERATURE, HEAT_SOURCES } from './temperatureHandler';
import { hasTempDependentCycle, TEMP_DEPENDENT_MACHINES, recipeUsesSteam, getTempDependentCycleTime } from './temperatureDependentCycles';
import { DEPTH_OUTPUTS, calculateDrillMetrics, buildDrillInputs, buildDrillOutputs } from '../data/mineshaftDrill';
import { MICROCHIP_STAGES, calculateLogicAssemblerMetrics, buildLogicAssemblerInputs, buildLogicAssemblerOutputs } from '../data/logicAssembler';
import { calculateTreeFarmMetrics, buildTreeFarmInputs, buildTreeFarmOutputs } from '../data/treeFarm';
import { calculateFireboxMetrics, buildFireboxInputs, isIndustrialFireboxRecipe } from '../data/industrialFirebox';
import { applyTemperatureToOutputs, initializeRecipeTemperatures } from './appUtilities';
import { DEFAULT_STEAM_TEMPERATURE } from './temperatureHandler';

/**
 * Calculate machine count needed to fully supply or consume a connected recipe
 */
export const calculateMachineCountForAutoConnect = (recipe, targetNode, autoConnect, findBestDepthForProduct, lastConfigs, globalPollution, flows) => {
  if (!autoConnect || !targetNode) return 1;
  
  const targetRecipe = targetNode.data.recipe;
  const targetMachineCount = targetNode.data.machineCount || 1;
  const targetMachine = getMachine(targetRecipe.machine_id);
  
  let targetCycleTime = targetRecipe.cycle_time;
  if (typeof targetCycleTime !== 'number' || targetCycleTime <= 0) targetCycleTime = 1;
  if (targetMachine && hasTempDependentCycle(targetMachine.id)) {
    const tempInfo = TEMP_DEPENDENT_MACHINES[targetMachine.id];
    if (tempInfo?.type === 'steam_input' && (targetMachine.id !== 'm_steam_cracking_plant' || recipeUsesSteam(targetRecipe))) {
      const inputTemp = targetRecipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE;
      targetCycleTime = getTempDependentCycleTime(targetMachine.id, inputTemp, targetCycleTime);
    }
  }
  
  // Configure recipe before calculating
  const configuredRecipe = configureSpecialRecipe(recipe, autoConnect, null, lastConfigs, globalPollution, findBestDepthForProduct);
  
  let recipeCycleTime = configuredRecipe.cycle_time;
  if (typeof recipeCycleTime !== 'number' || recipeCycleTime <= 0) recipeCycleTime = 1;
  
  const recipeMachine = getMachine(configuredRecipe.machine_id);
  if (recipeMachine && hasTempDependentCycle(recipeMachine.id)) {
    const tempInfo = TEMP_DEPENDENT_MACHINES[recipeMachine.id];
    if (tempInfo?.type === 'steam_input' && (recipeMachine.id !== 'm_steam_cracking_plant' || recipeUsesSteam(configuredRecipe))) {
      const inputTemp = configuredRecipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE;
      recipeCycleTime = getTempDependentCycleTime(recipeMachine.id, inputTemp, recipeCycleTime);
    }
  }
  
  // Use flow data to get actual needed/excess amounts
  let targetRate = 0;
  let hasFlowData = false;
  
  if (flows && flows.byNode && flows.byNode[targetNode.id]) {
    const nodeFlows = flows.byNode[targetNode.id];
    
    if (autoConnect.isOutput) {
      // Creating consumer for an output - use excess amount
      const outputFlow = nodeFlows.outputFlows[autoConnect.outputIndex];
      if (outputFlow) {
        hasFlowData = true;
        const excess = outputFlow.produced - outputFlow.connected;
        targetRate = Math.max(0, excess);
      }
    } else {
      // Creating producer for an input - use shortage amount
      const inputFlow = nodeFlows.inputFlows[autoConnect.inputIndex];
      if (inputFlow) {
        hasFlowData = true;
        const shortage = inputFlow.needed - inputFlow.connected;
        targetRate = Math.max(0, shortage);
      }
    }
  }
  
  // If we have flow data and targetRate is 0, return 0 immediately (fully used)
  if (hasFlowData && targetRate === 0) {
    return 0;
  }
  
  // Fallback to old calculation if no flow data
  if (!hasFlowData) {
    if (autoConnect.isOutput) {
      const targetOutput = targetRecipe.outputs[autoConnect.outputIndex];
      if (targetOutput) {
        const quantityForCalculation = targetOutput.originalQuantity !== undefined ? targetOutput.originalQuantity : targetOutput.quantity;
        if (typeof quantityForCalculation === 'number') {
          targetRate = (quantityForCalculation / targetCycleTime) * targetMachineCount;
        }
      }
    } else {
      const targetInput = targetRecipe.inputs[autoConnect.inputIndex];
      if (targetInput && typeof targetInput.quantity === 'number') {
        targetRate = (targetInput.quantity / targetCycleTime) * targetMachineCount;
      }
    }
  }
  
  // Calculate how many machines of the new recipe are needed
  if (autoConnect.isOutput) {
    const newInput = configuredRecipe.inputs.find(item => item.product_id === autoConnect.productId);
    if (newInput && typeof newInput.quantity === 'number' && newInput.quantity > 0) {
      const newRatePerMachine = newInput.quantity / recipeCycleTime;
      return targetRate / newRatePerMachine;
    }
  } else {
    const newOutput = configuredRecipe.outputs.find(item => item.product_id === autoConnect.productId);
    if (newOutput) {
      const quantityForCalculation = newOutput.originalQuantity !== undefined ? newOutput.originalQuantity : newOutput.quantity;
      if (typeof quantityForCalculation === 'number' && quantityForCalculation > 0) {
        const newRatePerMachine = quantityForCalculation / recipeCycleTime;
        return targetRate / newRatePerMachine;
      }
    }
  }
  
  return 1;
};

/**
 * Configure special recipes (drill, assembler, tree farm, firebox) based on context
 */
export const configureSpecialRecipe = (recipe, autoConnect, selectedProduct, lastConfigs, globalPollution, findBestDepthForProduct) => {
  let configuredRecipe = { ...recipe };
  const machine = getMachine(recipe.machine_id);
  
  // If not a special recipe, return as-is
  if (!isSpecialRecipe(configuredRecipe)) {
    return configuredRecipe;
  }
  
  // Handle industrial firebox
  if (machine?.id === 'm_industrial_firebox' && isIndustrialFireboxRecipe(recipe.id)) {
    const fuelProductIds = ['p_coal', 'p_coke_fuel', 'p_planks', 'p_oak_log'];
    let fuelToUse = lastConfigs?.fireboxConfig?.fuel || 'p_coke_fuel';
    
    const searchedProductId = autoConnect?.productId || selectedProduct?.id;
    if (searchedProductId && fuelProductIds.includes(searchedProductId)) {
      fuelToUse = searchedProductId;
    }
    
    const metrics = calculateFireboxMetrics(recipe.id, fuelToUse);
    if (metrics) {
      configuredRecipe = {
        ...configuredRecipe,
        inputs: buildFireboxInputs(recipe.inputs, fuelToUse, recipe.id),
        fireboxSettings: { fuel: fuelToUse },
        cycle_time: metrics.cycleTime,
        power_consumption: 0
      };
    }
    return configuredRecipe;
  }
  
  // Handle mineshaft drill
  if (recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill') {
    const defaultDrillHead = lastConfigs?.drillConfig?.drillHead || 'steel';
    const defaultConsumable = lastConfigs?.drillConfig?.consumable || 'hydrochloric_acid';
    const defaultMachineOil = lastConfigs?.drillConfig?.machineOil !== undefined ? lastConfigs.drillConfig.machineOil : true;
    
    const drillHeadIds = ['p_copper_drill_head', 'p_iron_drill_head', 'p_steel_drill_head', 'p_tungsten_carbide_drill_head'];
    const drillHeadMap = {
      'p_copper_drill_head': 'copper',
      'p_iron_drill_head': 'iron',
      'p_steel_drill_head': 'steel',
      'p_tungsten_carbide_drill_head': 'tungsten_carbide'
    };
    
    let drillHead = defaultDrillHead;
    let depth = 100;
    
    const searchedProductId = autoConnect?.productId || selectedProduct?.id;
    
    if (searchedProductId) {
      if (drillHeadIds.includes(searchedProductId)) {
        drillHead = drillHeadMap[searchedProductId];
      } else if (autoConnect?.isOutput) {
        // Use last depth for output connections
        depth = 100;
      } else {
        // Find best depth for searched product
        const bestDepth = findBestDepthForProduct(searchedProductId, drillHead, defaultConsumable, defaultMachineOil);
        if (bestDepth) depth = bestDepth;
      }
    }
    
    const drillInputs = buildDrillInputs(drillHead, defaultConsumable, defaultMachineOil, depth);
    const drillOutputs = buildDrillOutputs(drillHead, defaultConsumable, defaultMachineOil, depth);
    const metrics = calculateDrillMetrics(drillHead, defaultConsumable, defaultMachineOil, depth);
    
    configuredRecipe = {
      ...configuredRecipe,
      inputs: drillInputs.length > 0 ? drillInputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
      outputs: drillOutputs.length > 0 ? drillOutputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
      drillSettings: { drillHead, consumable: defaultConsumable, machineOil: defaultMachineOil, depth },
      cycle_time: 1,
      power_consumption: metrics ? { max: metrics.drillingPower * 1000000, average: ((metrics.drillingPower * metrics.lifeTime + metrics.idlePower * (metrics.replacementTime + metrics.travelTime)) / metrics.totalCycleTime) * 1000000 } : 'Variable',
      pollution: metrics ? metrics.pollution : 'Variable'
    };
    
    return configuredRecipe;
  }
  
  // Handle logic assembler
  if (recipe.isLogicAssembler || recipe.id === 'r_logic_assembler') {
    const defaultOuterStage = lastConfigs?.assemblerConfig?.outerStage || 1;
    const defaultInnerStage = lastConfigs?.assemblerConfig?.innerStage || 2;
    const defaultMachineOil = lastConfigs?.assemblerConfig?.machineOil !== undefined ? lastConfigs.assemblerConfig.machineOil : true;
    const defaultTickCircuitDelay = lastConfigs?.assemblerConfig?.tickCircuitDelay || 0;
    
    let targetMicrochip = defaultOuterStage === 1 ? `p_${defaultInnerStage}x_microchip` : `p_${defaultOuterStage}x${defaultInnerStage}x_microchip`;
    
    const searchedProductId = autoConnect?.productId || selectedProduct?.id;
    if (searchedProductId && searchedProductId.includes('microchip')) {
      targetMicrochip = searchedProductId;
    }
    
    const assemblerInputs = buildLogicAssemblerInputs(targetMicrochip, defaultMachineOil);
    const assemblerOutputs = buildLogicAssemblerOutputs(targetMicrochip, defaultMachineOil);
    const metrics = calculateLogicAssemblerMetrics(targetMicrochip, defaultMachineOil, defaultTickCircuitDelay);
    
    const match = targetMicrochip.match(/p_(?:(\d+)x)?(\d+)x_microchip/);
    const outerStage = match && match[1] ? parseInt(match[1]) : 1;
    const innerStage = match ? parseInt(match[2]) : defaultInnerStage;
    
    configuredRecipe = {
      ...configuredRecipe,
      inputs: assemblerInputs.length > 0 ? assemblerInputs : [{ product_id: 'p_logic_plate', quantity: 'Variable' }, { product_id: 'p_copper_wire', quantity: 'Variable' }, { product_id: 'p_semiconductor', quantity: 'Variable' }, { product_id: 'p_gold_wire', quantity: 'Variable' }],
      outputs: assemblerOutputs.length > 0 ? assemblerOutputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
      assemblerSettings: { outerStage, innerStage, machineOil: defaultMachineOil, tickCircuitDelay: defaultTickCircuitDelay },
      cycle_time: metrics ? metrics.cycleTime : 'Variable',
      power_consumption: metrics ? { max: metrics.maxPowerConsumption, average: metrics.avgPowerConsumption } : 'Variable'
    };
    
    return configuredRecipe;
  }
  
  // Handle tree farm
  if (recipe.isTreeFarm || recipe.id === 'r_tree_farm') {
    const defaultTrees = lastConfigs?.treeFarmConfig?.trees || 450;
    const defaultHarvesters = lastConfigs?.treeFarmConfig?.harvesters || 20;
    const defaultSprinklers = lastConfigs?.treeFarmConfig?.sprinklers || 24;
    const defaultOutputs = lastConfigs?.treeFarmConfig?.outputs || 8;
    const defaultController = 1;
    
    const treeFarmInputs = buildTreeFarmInputs(defaultSprinklers);
    const treeFarmOutputs = buildTreeFarmOutputs(defaultTrees, defaultHarvesters, globalPollution);
    const metrics = calculateTreeFarmMetrics(defaultTrees, defaultHarvesters, defaultSprinklers, defaultOutputs, defaultController, globalPollution);
    
    configuredRecipe = {
      ...configuredRecipe,
      inputs: treeFarmInputs.length > 0 ? treeFarmInputs : [{ product_id: 'p_water', quantity: 'Variable' }],
      outputs: treeFarmOutputs.length > 0 ? treeFarmOutputs : [{ product_id: 'p_oak_log', quantity: 'Variable' }],
      treeFarmSettings: { trees: defaultTrees, harvesters: defaultHarvesters, sprinklers: defaultSprinklers, outputs: defaultOutputs, controller: defaultController },
      cycle_time: 1,
      power_consumption: metrics ? metrics.avgPowerConsumption : 'Variable',
      pollution: 0
    };
    
    return configuredRecipe;
  }
  
  return configuredRecipe;
};

/**
 * Get all possible inputs for a special recipe
 */
export const getSpecialRecipeInputs = (recipeId) => {
  if (recipeId === 'r_mineshaft_drill') {
    return [
      'p_copper_drill_head', 'p_iron_drill_head', 'p_steel_drill_head', 'p_tungsten_carbide_drill_head',
      'p_water', 'p_acetic_acid', 'p_hydrochloric_acid', 'p_sulfuric_acid', 'p_machine_oil'
    ];
  }
  
  if (recipeId === 'r_logic_assembler') {
    return ['p_logic_plate', 'p_copper_wire', 'p_semiconductor', 'p_gold_wire', 'p_machine_oil'];
  }
  
  if (recipeId === 'r_tree_farm') {
    return ['p_water'];
  }
  
  // Industrial firebox with variable fuel
  const fireboxRecipesWithFuel = [
    'r_industrial_firebox_01', 'r_industrial_firebox_02', 'r_industrial_firebox_03',
    'r_industrial_firebox_04', 'r_industrial_firebox_05', 'r_industrial_firebox_06'
  ];
  if (fireboxRecipesWithFuel.includes(recipeId)) {
    return ['p_coal', 'p_coke_fuel', 'p_planks', 'p_oak_log'];
  }
  
  return [];
};

/**
 * Get all possible outputs for a special recipe
 */
export const getSpecialRecipeOutputs = (recipeId) => {
  if (recipeId === 'r_mineshaft_drill') {
    const allOutputs = new Set();
    Object.values(DEPTH_OUTPUTS).forEach(outputs => {
      outputs.forEach(o => allOutputs.add(o.product_id));
    });
    return Array.from(allOutputs);
  }
  
  if (recipeId === 'r_logic_assembler') {
    return MICROCHIP_STAGES.map(s => s.productId);
  }
  
  if (recipeId === 'r_tree_farm') {
    return ['p_oak_log'];
  }
  
  return [];
};

/**
 * Check if a recipe is a special recipe
 */
export const isSpecialRecipe = (recipe) => {
  return recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill' ||
         recipe.isLogicAssembler || recipe.id === 'r_logic_assembler' ||
         recipe.isTreeFarm || recipe.id === 'r_tree_farm' ||
         (recipe.machine_id === 'm_industrial_firebox' && isIndustrialFireboxRecipe(recipe.id));
};