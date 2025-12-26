import { getMachine } from '../data/dataLoader';

export const calculateTotalStats = (nodes) => {
  let totalPower = 0, totalPollution = 0, totalModelCount = 0;
  nodes.forEach(node => {
    const recipe = node.data?.recipe;
    const machine = node.data?.machine;
    if (!recipe) return;
    
    if (machine?.id === 'm_industrial_firebox') {
      const machineCount = node.data?.machineCount || 0;
      const pollution = recipe.pollution;
      const pollutionNum = typeof pollution === 'number' ? pollution : parseFloat(pollution);
      if (!isNaN(pollutionNum) && isFinite(pollutionNum)) totalPollution += pollutionNum * machineCount;
      const inputOutputCount = (recipe.inputs?.length || 0) + (recipe.outputs?.length || 0);
      const powerFactor = 0;
      const inputOutputFactor = inputOutputCount * 2;
      const roundedMachineCount = Math.ceil(machineCount);
      totalModelCount += roundedMachineCount * (1 + powerFactor + inputOutputFactor);
      return;
    }
    
    if (machine?.id === 'm_tree_farm' && recipe?.treeFarmSettings) {
      const machineCount = node.data?.machineCount || 0;
      const settings = recipe.treeFarmSettings;
      const waterTanks = Math.ceil(settings.sprinklers / 3);
      
      const power = recipe.power_consumption;
      const powerValue = typeof power === 'number' ? power : 0;
      totalPower += powerValue * machineCount;
      
      const pollution = recipe.pollution;
      const pollutionNum = typeof pollution === 'number' ? pollution : parseFloat(pollution);
      if (!isNaN(pollutionNum) && isFinite(pollutionNum)) totalPollution += pollutionNum * machineCount;
      
      const powerFactor = Math.ceil(powerValue / 1500000) * 2;
      const treeFarmModelCount = settings.trees + settings.harvesters + settings.sprinklers + 
                                  (waterTanks * 3) + settings.controller + (settings.outputs * 3) + powerFactor;
      const roundedMachineCount = Math.ceil(machineCount);
      totalModelCount += roundedMachineCount * treeFarmModelCount;
      return;
    }
    
    const machineCount = node.data?.machineCount || 0;
    const power = recipe.power_consumption;
    let powerValue = 0;
    if (typeof power === 'number') { powerValue = power; totalPower += power * machineCount; }
    else if (typeof power === 'object' && power !== null && 'max' in power) { powerValue = power.max; totalPower += powerValue * machineCount; }
    const pollution = recipe.pollution;
    const pollutionNum = typeof pollution === 'number' ? pollution : parseFloat(pollution);
    if (!isNaN(pollutionNum) && isFinite(pollutionNum)) totalPollution += pollutionNum * machineCount;
    const inputOutputCount = (recipe.inputs?.length || 0) + (recipe.outputs?.length || 0);
    const powerFactor = Math.ceil(powerValue / 1500000) * 2;
    const inputOutputFactor = inputOutputCount * 2;
    const roundedMachineCount = Math.ceil(machineCount);
    totalModelCount += roundedMachineCount * (1 + powerFactor + inputOutputFactor);
  });
  return { totalPower, totalPollution, totalModelCount };
};

export const calculateMachineStats = (nodes) => {
  const machineCounts = {}, machineCosts = {};
  nodes.forEach(node => {
    const machine = node.data?.machine;
    const machineCount = node.data?.machineCount || 0;
    const recipe = node.data?.recipe;
    if (!machine) return;
    
    if (machine.id === 'm_tree_farm' && recipe?.treeFarmSettings) {
      const settings = recipe.treeFarmSettings;
      const waterTanks = Math.ceil(settings.sprinklers / 3);
      
      if (!machineCounts['m_tree']) machineCounts['m_tree'] = 0;
      if (!machineCosts['m_tree']) machineCosts['m_tree'] = getMachine('m_tree')?.cost || 0;
      machineCounts['m_tree'] += Math.ceil(settings.trees * machineCount);
      
      if (!machineCounts['m_tree_harvester']) machineCounts['m_tree_harvester'] = 0;
      if (!machineCosts['m_tree_harvester']) machineCosts['m_tree_harvester'] = getMachine('m_tree_harvester')?.cost || 0;
      machineCounts['m_tree_harvester'] += Math.ceil(settings.harvesters * machineCount);
      
      if (!machineCounts['m_tree_farm_sprinkler']) machineCounts['m_tree_farm_sprinkler'] = 0;
      if (!machineCosts['m_tree_farm_sprinkler']) machineCosts['m_tree_farm_sprinkler'] = getMachine('m_tree_farm_sprinkler')?.cost || 0;
      machineCounts['m_tree_farm_sprinkler'] += Math.ceil(settings.sprinklers * machineCount);
      
      if (!machineCounts['m_tree_farm_water_tank']) machineCounts['m_tree_farm_water_tank'] = 0;
      if (!machineCosts['m_tree_farm_water_tank']) machineCosts['m_tree_farm_water_tank'] = getMachine('m_tree_farm_water_tank')?.cost || 0;
      machineCounts['m_tree_farm_water_tank'] += Math.ceil(waterTanks * machineCount);
      
      if (!machineCounts['m_tree_farm_output']) machineCounts['m_tree_farm_output'] = 0;
      if (!machineCosts['m_tree_farm_output']) machineCosts['m_tree_farm_output'] = getMachine('m_tree_farm_output')?.cost || 0;
      machineCounts['m_tree_farm_output'] += Math.ceil(settings.outputs * machineCount);
      
      if (!machineCounts['m_tree_farm_controller']) machineCounts['m_tree_farm_controller'] = 0;
      if (!machineCosts['m_tree_farm_controller']) machineCosts['m_tree_farm_controller'] = getMachine('m_tree_farm_controller')?.cost || 0;
      machineCounts['m_tree_farm_controller'] += Math.ceil(settings.controller * machineCount);
      
      return;
    }
    
    const machineId = machine.id;
    const roundedCount = Math.ceil(machineCount);
    if (!machineCounts[machineId]) { machineCounts[machineId] = 0; machineCosts[machineId] = typeof machine.cost === 'number' ? machine.cost : 0; }
    machineCounts[machineId] += roundedCount;
  });
  const stats = Object.keys(machineCounts).map(machineId => {
    const machine = getMachine(machineId);
    const count = machineCounts[machineId];
    const cost = machineCosts[machineId];
    return { machineId, machine, count, cost, totalCost: count * cost };
  }).sort((a, b) => a.machine.name.localeCompare(b.machine.name));
  return { stats, totalCost: stats.reduce((sum, stat) => sum + stat.totalCost, 0) };
};