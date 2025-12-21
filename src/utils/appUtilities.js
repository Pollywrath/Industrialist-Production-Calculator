import { recipes } from '../data/dataLoader';
import { DEPTH_OUTPUTS } from '../data/mineshaftDrill';
import { MICROCHIP_STAGES } from '../data/logicAssembler';
import { HEAT_SOURCES, calculateOutputTemperature, DEFAULT_BOILER_INPUT_TEMPERATURE, 
  DEFAULT_WATER_TEMPERATURE, DEFAULT_STEAM_TEMPERATURE, getDefaultTemperatureSettings, isTemperatureProduct } from '../utils/temperatureHandler';
import { hasTempDependentCycle, TEMP_DEPENDENT_MACHINES } from '../utils/temperatureDependentCycles';

export const smartFormat = (num) => typeof num === 'number' ? Math.round(num * 10000) / 10000 : num;

export const metricFormat = (num) => {
  if (typeof num !== 'number') return num;
  if (num >= 1000000000) return smartFormat(num / 1000000000) + 'B';
  if (num >= 1000000) return smartFormat(num / 1000000) + 'M';
  if (num >= 1000) return smartFormat(num / 1000) + 'k';
  return smartFormat(num);
};

export const formatPowerDisplay = (power) => {
  if (power >= 1000000) return `${(power / 1000000).toFixed(2)} MMF/s`;
  if (power >= 1000) return `${(power / 1000).toFixed(2)} kMF/s`;
  return `${power.toFixed(2)} MF/s`;
};

export const getRecipesUsingProduct = (productId) => 
  recipes.filter(r => 
    !['r_mineshaft_drill_01', 'r_logic_assembler_01'].includes(r.id) && 
    r.inputs.some(i => i.product_id === productId && i.product_id !== 'p_variableproduct')
  );

export const getRecipesProducingProductFiltered = (productId) => 
  recipes.filter(r => 
    !['r_mineshaft_drill_01', 'r_logic_assembler_01'].includes(r.id) && 
    r.outputs.some(o => o.product_id === productId && o.product_id !== 'p_variableproduct')
  );

export const getRecipesForMachine = (machineId) => recipes.filter(r => r.machine_id === machineId);

export const canDrillUseProduct = (productId) => 
  ['p_copper_drill_head', 'p_iron_drill_head', 'p_steel_drill_head', 'p_tungsten_carbide_drill_head',
   'p_water', 'p_acetic_acid', 'p_hydrochloric_acid', 'p_sulfuric_acid', 'p_machine_oil'].includes(productId) || 
  Object.values(DEPTH_OUTPUTS).some(outputs => outputs.some(o => o.product_id === productId));

export const canLogicAssemblerUseProduct = (productId) => 
  ['p_logic_plate', 'p_copper_wire', 'p_semiconductor', 'p_gold_wire', 'p_machine_oil'].includes(productId) || 
  MICROCHIP_STAGES.some(s => s.productId === productId);

export const canTreeFarmUseProduct = (productId) => 
  ['p_water', 'p_oak_log'].includes(productId);

export const applyTemperatureToOutputs = (outputs, temperature, isBoiler, heatSource, inputTemp = DEFAULT_WATER_TEMPERATURE) => {
  const minSteamTemp = heatSource?.minSteamTemp || 100;
  
  return outputs.map(output => {
    if (isBoiler) {
      if (output.product_id === 'p_steam') {
        const finalTemp = Math.max(temperature, inputTemp);
        const originalQuantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
        
        if (finalTemp < minSteamTemp) {
          return { ...output, temperature: finalTemp, quantity: 0, originalQuantity };
        }
        return { ...output, temperature: finalTemp, quantity: originalQuantity, originalQuantity };
      }
      return output;
    }
    
    if (isTemperatureProduct(output.product_id)) {
      const finalTemp = Math.max(temperature, inputTemp);
      return { ...output, temperature: finalTemp };
    }
    return output;
  });
};

export const initializeRecipeTemperatures = (recipe, machineId) => {
  let updatedRecipe = { ...recipe };
  
  // Initialize heat source temperatures (for machines that output temperature products)
  const heatSource = HEAT_SOURCES[machineId];
  if (heatSource) {
    const defaultSettings = getDefaultTemperatureSettings(machineId);
    const isBoiler = heatSource.type === 'boiler';
    const inputTemp = isBoiler ? DEFAULT_BOILER_INPUT_TEMPERATURE : DEFAULT_WATER_TEMPERATURE;
    
    // For boilers, store the coolant temp in settings
    const settingsWithCoolant = isBoiler 
      ? { ...defaultSettings, coolantTemp: DEFAULT_BOILER_INPUT_TEMPERATURE }
      : defaultSettings;
    
    // For product-dependent heat sources (like gas burner), find the water input product
    let inputProductId = null;
    if (heatSource.type === 'product_dependent' && recipe.inputs) {
      const waterInput = recipe.inputs.find(input => 
        ['p_water', 'p_filtered_water', 'p_distilled_water'].includes(input.product_id)
      );
      inputProductId = waterInput?.product_id || null;
    }
    
    // For boilers, pass the coolant temp as secondInputTemp parameter
    const outputTemp = calculateOutputTemperature(machineId, settingsWithCoolant, inputTemp, inputProductId, isBoiler ? DEFAULT_BOILER_INPUT_TEMPERATURE : null);
    const updatedOutputs = applyTemperatureToOutputs(recipe.outputs, outputTemp, isBoiler, heatSource, inputTemp);

    updatedRecipe = { ...updatedRecipe, outputs: updatedOutputs, temperatureSettings: settingsWithCoolant };
  }
  
  // Initialize temperature-dependent input temperatures (for machines with temp-dependent cycles)
  const isTempDependent = hasTempDependentCycle(machineId);
  if (isTempDependent) {
    const tempDependentInfo = TEMP_DEPENDENT_MACHINES[machineId];
    if (tempDependentInfo?.type === 'steam_input') {
      updatedRecipe = { ...updatedRecipe, tempDependentInputTemp: DEFAULT_STEAM_TEMPERATURE };
    }
  }

  return updatedRecipe;
};