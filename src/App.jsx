import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, addEdge, useNodesState, useEdgesState, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './components/CustomNode';
import CustomEdge from './components/CustomEdge';
import ThemeEditor, { applyTheme, loadTheme } from './components/ThemeEditor';
import { products, machines, recipes, getMachine, getProduct, updateProducts, updateMachines, 
  updateRecipes, saveCanvasState, loadCanvasState, restoreDefaults } from './data/dataLoader';
import { getProductName, formatIngredient } from './utils/variableHandler';
import { calculateOutputTemperature, isTemperatureProduct, HEAT_SOURCES, DEFAULT_BOILER_INPUT_TEMPERATURE, 
  DEFAULT_WATER_TEMPERATURE, DEFAULT_STEAM_TEMPERATURE } from './utils/temperatureHandler';
import { hasTempDependentCycle, TEMP_DEPENDENT_MACHINES, recipeUsesSteam, getSteamInputIndex, getTempDependentCycleTime } from './utils/temperatureDependentCycles';
import { DEFAULT_DRILL_RECIPE, DEPTH_OUTPUTS, calculateDrillMetrics, buildDrillInputs, buildDrillOutputs } from './data/mineshaftDrill';
import { DEFAULT_LOGIC_ASSEMBLER_RECIPE, MICROCHIP_STAGES, calculateLogicAssemblerMetrics, buildLogicAssemblerInputs, buildLogicAssemblerOutputs } from './data/logicAssembler';
import { DEFAULT_TREE_FARM_RECIPE, calculateTreeFarmMetrics, buildTreeFarmInputs, buildTreeFarmOutputs } from './data/treeFarm';
import { FUEL_PRODUCTS, calculateFireboxMetrics, buildFireboxInputs, isIndustrialFireboxRecipe } from './data/industrialFirebox';
import { applyChemicalPlantSettings, DEFAULT_CHEMICAL_PLANT_SETTINGS } from './data/chemicalPlant';
import { solveProductionNetwork, getExcessProducts, getDeficientProducts } from './solvers/productionSolver';
import { smartFormat, metricFormat, formatPowerDisplay, getRecipesUsingProduct, getRecipesProducingProductFiltered, 
  getRecipesForMachine, canDrillUseProduct, canLogicAssemblerUseProduct, canTreeFarmUseProduct, applyTemperatureToOutputs, 
  initializeRecipeTemperatures } from './utils/appUtilities';

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };
const calculateResidueAmount = (globalPollution) => {
  const x = globalPollution;
  
  // Only apply formula for negative pollution values
  if (x < 0) {
    return 0;
  }
  
  // Calculate the argument for ln to avoid invalid values
  const lnArg = 1 + (5429 * x) / 7322;
  return Math.pow(Math.log(lnArg), 1.1);
};

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState([]);
  const [nodeId, setNodeId] = useState(0);
  const [showRecipeSelector, setShowRecipeSelector] = useState(false);
  const [keepOverlayDuringTransition, setKeepOverlayDuringTransition] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectorMode, setSelectorMode] = useState('product');
  const [selectorOpenedFrom, setSelectorOpenedFrom] = useState('button');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filterType, setFilterType] = useState('all');
  const [recipeFilter, setRecipeFilter] = useState('all');
  const [autoConnectTarget, setAutoConnectTarget] = useState(null);
  const [targetProducts, setTargetProducts] = useState([]);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [targetIdCounter, setTargetIdCounter] = useState(0);
  const [showMachineCountEditor, setShowMachineCountEditor] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingMachineCount, setEditingMachineCount] = useState('');
  const [newNodePendingMachineCount, setNewNodePendingMachineCount] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [extendedPanelOpen, setExtendedPanelOpen] = useState(false);
  const [extendedPanelClosing, setExtendedPanelClosing] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [globalPollution, setGlobalPollution] = useState(0);
  const [pollutionInputFocused, setPollutionInputFocused] = useState(false);
  const [isPollutionPaused, setIsPollutionPaused] = useState(false);
  const [soldProducts, setSoldProducts] = useState({});
  const [displayMode, setDisplayMode] = useState('perSecond');
  const [machineDisplayMode, setMachineDisplayMode] = useState('total');
  const [favoriteRecipes, setFavoriteRecipes] = useState([]);
  const [lastDrillConfig, setLastDrillConfig] = useState(null);
  const [lastAssemblerConfig, setLastAssemblerConfig] = useState(null);
  const [lastTreeFarmConfig, setLastTreeFarmConfig] = useState(null);
  const [lastFireboxConfig, setLastFireboxConfig] = useState(null);
  const [recipeMachineCounts, setRecipeMachineCounts] = useState({});
  const reactFlowWrapper = useRef(null);
  const fileInputRef = useRef(null);

  const isForestTheme = () => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim().toLowerCase() === '#5fb573';
  const statisticsTitle = isForestTheme() ? "Plant Statistics" : "Plan Statistics";

  const onEdgesChange = useCallback((changes) => {
    onEdgesChangeBase(changes);
  }, [onEdgesChangeBase]);

  useEffect(() => { applyTheme(loadTheme()); }, []);

  useEffect(() => {
    const savedState = loadCanvasState();
    if (savedState?.nodes) {
      const restoredNodes = savedState.nodes.map(node => {
        const machine = getMachine(node.data?.recipe?.machine_id);
        let recipe = node.data?.recipe;
        if (machine && recipe && !recipe.outputs?.some(o => o.temperature !== undefined)) recipe = initializeRecipeTemperatures(recipe, machine.id);
        return { ...node, data: { ...node.data, recipe, machineCount: node.data.machineCount ?? 1, displayMode, machineDisplayMode,
          onInputClick: openRecipeSelectorForInput, onOutputClick: openRecipeSelectorForOutput, onDrillSettingsChange: handleDrillSettingsChange,
          onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange, onTreeFarmSettingsChange: handleTreeFarmSettingsChange,
          onIndustrialFireboxSettingsChange: handleIndustrialFireboxSettingsChange, onTemperatureSettingsChange: handleTemperatureSettingsChange, 
          onBoilerSettingsChange: handleBoilerSettingsChange, onChemicalPlantSettingsChange: handleChemicalPlantSettingsChange, globalPollution }};
      });
      setNodes(restoredNodes);
      setEdges(savedState.edges || []);
      setTargetProducts(savedState.targetProducts || []);
      setSoldProducts(savedState.soldProducts || {});
      setFavoriteRecipes(savedState.favoriteRecipes || []);
      setLastDrillConfig(savedState.lastDrillConfig || null);
      setLastAssemblerConfig(savedState.lastAssemblerConfig || null);
      setLastTreeFarmConfig(savedState.lastTreeFarmConfig || null);
      setLastFireboxConfig(savedState.lastFireboxConfig || null);
      setNodeId(savedState.nodeId || 0);
      setTargetIdCounter(savedState.targetIdCounter || 0);
    }
  }, []);

  useEffect(() => { setNodes(nds => nds.map(node => ({ ...node, data: { ...node.data, displayMode } }))); }, [displayMode, setNodes]);
  useEffect(() => { setNodes(nds => nds.map(node => ({ ...node, data: { ...node.data, machineDisplayMode } }))); }, [machineDisplayMode, setNodes]);
  useEffect(() => { 
    const stateToSave = { nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts, favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig };
    localStorage.setItem('industrialist_canvas_state', JSON.stringify(stateToSave));
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts, favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig]);

  const calculateTotalStats = useCallback(() => {
    let totalPower = 0, totalPollution = 0, totalModelCount = 0;
    nodes.forEach(node => {
      const recipe = node.data?.recipe;
      const machine = node.data?.machine;
      if (!recipe) return;
      
      // Skip industrial firebox in power calculations (uses internal energy system)
      if (machine?.id === 'm_industrial_firebox') {
        const machineCount = node.data?.machineCount || 0;
        const pollution = recipe.pollution;
        if (typeof pollution === 'number') totalPollution += pollution * machineCount;
        const inputOutputCount = (recipe.inputs?.length || 0) + (recipe.outputs?.length || 0);
        totalModelCount += Math.ceil(machineCount) + Math.ceil(machineCount) * inputOutputCount * 2;
        return;
      }
      
      const machineCount = node.data?.machineCount || 0;
      const power = recipe.power_consumption;
      let powerValue = 0;
      if (typeof power === 'number') { powerValue = power; totalPower += power * machineCount; }
      else if (typeof power === 'object' && power !== null && 'max' in power) { powerValue = power.max; totalPower += powerValue * machineCount; }
      const pollution = recipe.pollution;
      if (typeof pollution === 'number') totalPollution += pollution * machineCount;
      const inputOutputCount = (recipe.inputs?.length || 0) + (recipe.outputs?.length || 0);
      totalModelCount += Math.ceil(machineCount) + Math.ceil(machineCount * powerValue / 1500000) + Math.ceil(machineCount) * inputOutputCount * 2;
    });
    return { totalPower, totalPollution, totalModelCount };
  }, [nodes]);

  const stats = calculateTotalStats();
  
  useEffect(() => {
    const interval = setInterval(() => {
      if (pollutionInputFocused || isPollutionPaused) return;
      const pollutionPerSecond = stats.totalPollution / 3600;
      setGlobalPollution(prev => (typeof prev === 'number' && !isNaN(prev) && isFinite(prev)) ? parseFloat((prev + pollutionPerSecond).toFixed(4)) : prev);
    }, 1000);
    return () => clearInterval(interval);
  }, [stats.totalPollution, pollutionInputFocused, isPollutionPaused]);

  useEffect(() => {
    // Update tree farms and air separation units when pollution changes
    setNodes(nds => nds.map(node => {
      const recipe = node.data?.recipe;
      const machine = node.data?.machine;
      
      // Update tree farms
      if (recipe?.isTreeFarm && recipe.treeFarmSettings) {
        const settings = recipe.treeFarmSettings;
        const updatedOutputs = buildTreeFarmOutputs(settings.trees, settings.harvesters, globalPollution);
        const metrics = calculateTreeFarmMetrics(settings.trees, settings.harvesters, settings.sprinklers, settings.outputs, settings.controller, globalPollution);
        
        return {
          ...node,
          data: {
            ...node.data,
            recipe: {
              ...recipe,
              outputs: updatedOutputs,
              power_consumption: metrics ? metrics.avgPowerConsumption : 'Variable'
            },
            globalPollution
          }
        };
      }
      
      // Update air separation units
      if (machine?.id === 'm_air_separation_unit') {
        const residueAmount = calculateResidueAmount(globalPollution);
        const updatedOutputs = recipe.outputs.map(output => {
          if (output.product_id === 'p_residue') {
            return { ...output, quantity: parseFloat(residueAmount.toFixed(6)) };
          }
          return output;
        });
        
        return {
          ...node,
          data: {
            ...node.data,
            recipe: {
              ...recipe,
              outputs: updatedOutputs
            },
            globalPollution
          }
        };
      }
      
      // Update globalPollution for all nodes
      return {
        ...node,
        data: {
          ...node.data,
          globalPollution
        }
      };
    }));
  }, [globalPollution, setNodes]);

  const productionSolution = useMemo(() => solveProductionNetwork(nodes, edges), [nodes, edges]);
  const excessProductsRaw = useMemo(() => getExcessProducts(productionSolution), [productionSolution]);
  const deficientProducts = useMemo(() => getDeficientProducts(productionSolution), [productionSolution]);
  const excessProducts = useMemo(() => excessProductsRaw.map(item => {
    const shouldAutoSell = typeof item.product.price === 'number' && item.product.price > 0;
    const explicitlySold = soldProducts[item.productId];
    return { ...item, isSold: explicitlySold !== undefined ? explicitlySold : shouldAutoSell };
  }), [excessProductsRaw, soldProducts]);
  const totalProfit = useMemo(() => excessProducts.reduce((profit, item) => item.isSold && typeof item.product.price === 'number' ? profit + item.product.price * item.excessRate : profit, 0), [excessProducts]);
  const machineStats = useMemo(() => {
    const machineCounts = {}, machineCosts = {};
    nodes.forEach(node => {
      const machine = node.data?.machine;
      const machineCount = node.data?.machineCount || 0;
      const recipe = node.data?.recipe;
      if (!machine) return;
      
      // Special handling for tree farm - count all sub-machines
      if (machine.id === 'm_tree_farm' && recipe?.treeFarmSettings) {
        const settings = recipe.treeFarmSettings;
        const waterTanks = Math.ceil(settings.sprinklers / 3);
        
        // Add trees
        if (!machineCounts['m_tree']) machineCounts['m_tree'] = 0;
        if (!machineCosts['m_tree']) machineCosts['m_tree'] = getMachine('m_tree')?.cost || 0;
        machineCounts['m_tree'] += Math.ceil(settings.trees * machineCount);
        
        // Add harvesters
        if (!machineCounts['m_tree_harvester']) machineCounts['m_tree_harvester'] = 0;
        if (!machineCosts['m_tree_harvester']) machineCosts['m_tree_harvester'] = getMachine('m_tree_harvester')?.cost || 0;
        machineCounts['m_tree_harvester'] += Math.ceil(settings.harvesters * machineCount);
        
        // Add sprinklers
        if (!machineCounts['m_tree_farm_sprinkler']) machineCounts['m_tree_farm_sprinkler'] = 0;
        if (!machineCosts['m_tree_farm_sprinkler']) machineCosts['m_tree_farm_sprinkler'] = getMachine('m_tree_farm_sprinkler')?.cost || 0;
        machineCounts['m_tree_farm_sprinkler'] += Math.ceil(settings.sprinklers * machineCount);
        
        // Add water tanks
        if (!machineCounts['m_tree_farm_water_tank']) machineCounts['m_tree_farm_water_tank'] = 0;
        if (!machineCosts['m_tree_farm_water_tank']) machineCosts['m_tree_farm_water_tank'] = getMachine('m_tree_farm_water_tank')?.cost || 0;
        machineCounts['m_tree_farm_water_tank'] += Math.ceil(waterTanks * machineCount);
        
        // Add outputs
        if (!machineCounts['m_tree_farm_output']) machineCounts['m_tree_farm_output'] = 0;
        if (!machineCosts['m_tree_farm_output']) machineCosts['m_tree_farm_output'] = getMachine('m_tree_farm_output')?.cost || 0;
        machineCounts['m_tree_farm_output'] += Math.ceil(settings.outputs * machineCount);
        
        // Add controller
        if (!machineCounts['m_tree_farm_controller']) machineCounts['m_tree_farm_controller'] = 0;
        if (!machineCosts['m_tree_farm_controller']) machineCosts['m_tree_farm_controller'] = getMachine('m_tree_farm_controller')?.cost || 0;
        machineCounts['m_tree_farm_controller'] += Math.ceil(settings.controller * machineCount);
        
        return; // Skip adding the main m_tree_farm machine
      }
      
      const machineId = machine.id;
      const roundedCount = Math.ceil(machineCount);
      if (!machineCounts[machineId]) { machineCounts[machineId] = 0; machineCosts[machineId] = typeof machine.cost === 'number' ? machine.cost : 0; }
      machineCounts[machineId] += roundedCount;
    });
    const stats = Object.keys(machineCounts).map(machineId => {
      const machine = machines.find(m => m.id === machineId);
      const count = machineCounts[machineId];
      const cost = machineCosts[machineId];
      return { machineId, machine, count, cost, totalCost: count * cost };
    }).sort((a, b) => a.machine.name.localeCompare(b.machine.name));
    return { stats, totalCost: stats.reduce((sum, stat) => sum + stat.totalCost, 0) };
  }, [nodes, machines]);

  const updateNodeData = (nodeId, updater) => setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: updater(n.data) } : n));

  const findBestDepthForProduct = useCallback((productId, drillHead, consumable, machineOil) => {
    const availableDepths = Object.keys(DEPTH_OUTPUTS).map(d => parseInt(d));
    let bestDepth = null;
    let bestRate = 0;
    
    availableDepths.forEach(depth => {
      const outputs = DEPTH_OUTPUTS[depth];
      const outputForProduct = outputs.find(o => o.product_id === productId);
      
      if (outputForProduct) {
        const metrics = calculateDrillMetrics(drillHead, consumable, machineOil, depth);
        if (metrics) {
          const oilBonus = machineOil ? 1.1 : 1;
          const effectiveRate = outputForProduct.quantity * oilBonus * metrics.dutyCycle;
          
          if (effectiveRate > bestRate) {
            bestRate = effectiveRate;
            bestDepth = depth;
          }
        }
      }
    });
    
    return bestDepth;
  }, []);

  const calculateMachineCountForRecipe = useCallback((recipe, targetNode, autoConnect) => {
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
    
    // Configure special recipes before calculating
    let configuredRecipe = { ...recipe };
    const recipeMachine = getMachine(recipe.machine_id);
    
    // Handle industrial firebox
    if (recipeMachine?.id === 'm_industrial_firebox' && isIndustrialFireboxRecipe(recipe.id)) {
      const fuelProductIds = ['p_coal', 'p_coke_fuel', 'p_planks', 'p_oak_log'];
      let fuelToUse = lastFireboxConfig?.fuel || 'p_coke_fuel';
      
      if (fuelProductIds.includes(autoConnect.productId)) {
        fuelToUse = autoConnect.productId;
      }
      
      const metrics = calculateFireboxMetrics(recipe.id, fuelToUse);
      if (metrics) {
        configuredRecipe = {
          ...configuredRecipe,
          inputs: buildFireboxInputs(recipe.inputs, fuelToUse, recipe.id),
          cycle_time: metrics.cycleTime
        };
      }
    }
    
    // Handle mineshaft drill
    if (recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill') {
      const defaultDrillHead = lastDrillConfig?.drillHead || 'steel';
      const defaultConsumable = lastDrillConfig?.consumable || 'hydrochloric_acid';
      const defaultMachineOil = lastDrillConfig?.machineOil !== undefined ? lastDrillConfig.machineOil : true;
      
      const drillHeadIds = ['p_copper_drill_head', 'p_iron_drill_head', 'p_steel_drill_head', 'p_tungsten_carbide_drill_head'];
      const drillHeadMap = {
        'p_copper_drill_head': 'copper',
        'p_iron_drill_head': 'iron',
        'p_steel_drill_head': 'steel',
        'p_tungsten_carbide_drill_head': 'tungsten_carbide'
      };
      
      let drillHead = defaultDrillHead;
      let depth = 100;
      
      if (drillHeadIds.includes(autoConnect.productId)) {
        drillHead = drillHeadMap[autoConnect.productId];
      } else if (!autoConnect.isOutput) {
        const bestDepth = findBestDepthForProduct(autoConnect.productId, drillHead, defaultConsumable, defaultMachineOil);
        if (bestDepth) depth = bestDepth;
      }
      
      const drillInputs = buildDrillInputs(drillHead, defaultConsumable, defaultMachineOil, depth);
      const drillOutputs = buildDrillOutputs(drillHead, defaultConsumable, defaultMachineOil, depth);
      
      configuredRecipe = {
        ...configuredRecipe,
        inputs: drillInputs,
        outputs: drillOutputs,
        cycle_time: 1
      };
    }
    
    // Handle logic assembler
    if (recipe.isLogicAssembler || recipe.id === 'r_logic_assembler') {
      const defaultOuterStage = lastAssemblerConfig?.outerStage || 1;
      const defaultInnerStage = lastAssemblerConfig?.innerStage || 2;
      const defaultMachineOil = lastAssemblerConfig?.machineOil !== undefined ? lastAssemblerConfig.machineOil : true;
      
      let targetMicrochip = autoConnect.productId.includes('microchip') 
        ? autoConnect.productId 
        : (defaultOuterStage === 1 ? `p_${defaultInnerStage}x_microchip` : `p_${defaultOuterStage}x${defaultInnerStage}x_microchip`);
      
      const assemblerInputs = buildLogicAssemblerInputs(targetMicrochip, defaultMachineOil);
      const assemblerOutputs = buildLogicAssemblerOutputs(targetMicrochip, defaultMachineOil);
      const metrics = calculateLogicAssemblerMetrics(targetMicrochip, defaultMachineOil, 0);
      
      configuredRecipe = {
        ...configuredRecipe,
        inputs: assemblerInputs,
        outputs: assemblerOutputs,
        cycle_time: metrics ? metrics.cycleTime : 1
      };
    }
    
    // Handle tree farm
    if (recipe.isTreeFarm || recipe.id === 'r_tree_farm') {
      const defaultTrees = lastTreeFarmConfig?.trees || 450;
      const defaultHarvesters = lastTreeFarmConfig?.harvesters || 20;
      
      const treeFarmInputs = buildTreeFarmInputs(24);
      const treeFarmOutputs = buildTreeFarmOutputs(defaultTrees, defaultHarvesters, globalPollution);
      
      configuredRecipe = {
        ...configuredRecipe,
        inputs: treeFarmInputs,
        outputs: treeFarmOutputs,
        cycle_time: 1
      };
    }
    
    let recipeCycleTime = configuredRecipe.cycle_time;
    if (typeof recipeCycleTime !== 'number' || recipeCycleTime <= 0) recipeCycleTime = 1;
    
    if (recipeMachine && hasTempDependentCycle(recipeMachine.id)) {
      const tempInfo = TEMP_DEPENDENT_MACHINES[recipeMachine.id];
      if (tempInfo?.type === 'steam_input' && (recipeMachine.id !== 'm_steam_cracking_plant' || recipeUsesSteam(configuredRecipe))) {
        const inputTemp = configuredRecipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE;
        recipeCycleTime = getTempDependentCycleTime(recipeMachine.id, inputTemp, recipeCycleTime);
      }
    }
    
    if (autoConnect.isOutput) {
      const targetOutput = targetRecipe.outputs[autoConnect.outputIndex];
      if (targetOutput) {
        const quantityForCalculation = targetOutput.originalQuantity !== undefined ? targetOutput.originalQuantity : targetOutput.quantity;
        if (typeof quantityForCalculation === 'number') {
          const targetRate = (quantityForCalculation / targetCycleTime) * targetMachineCount;
          const newInput = configuredRecipe.inputs.find(item => item.product_id === autoConnect.productId);
          if (newInput && typeof newInput.quantity === 'number' && newInput.quantity > 0) {
            const newRatePerMachine = newInput.quantity / recipeCycleTime;
            return targetRate / newRatePerMachine;
          }
        }
      }
    } else {
      const targetInput = targetRecipe.inputs[autoConnect.inputIndex];
      if (targetInput && typeof targetInput.quantity === 'number') {
        const targetRate = (targetInput.quantity / targetCycleTime) * targetMachineCount;
        const newOutput = configuredRecipe.outputs.find(item => item.product_id === autoConnect.productId);
        if (newOutput) {
          const quantityForCalculation = newOutput.originalQuantity !== undefined ? newOutput.originalQuantity : newOutput.quantity;
          if (typeof quantityForCalculation === 'number' && quantityForCalculation > 0) {
            const newRatePerMachine = quantityForCalculation / recipeCycleTime;
            return targetRate / newRatePerMachine;
          }
        }
      }
    }
    
    return 1;
  }, [lastFireboxConfig, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, findBestDepthForProduct, globalPollution]);


  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    if (!sourceNode || !targetNode) return;
    const sourceProductId = sourceNode.data.recipe.outputs[parseInt(params.sourceHandle.split('-')[1])]?.product_id;
    const targetProductId = targetNode.data.recipe.inputs[parseInt(params.targetHandle.split('-')[1])]?.product_id;
    if (sourceProductId !== targetProductId) return;
    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds));
  }, [setEdges, nodes]);

  const resetSelector = () => {
    setShowRecipeSelector(false); setSelectedProduct(null); setSelectedMachine(null); setSelectorMode('product');
    setSearchTerm(''); setSortBy('name_asc'); setFilterType('all'); setRecipeFilter('all'); setAutoConnectTarget(null); setSelectorOpenedFrom('button');
    setRecipeMachineCounts({});
  };

  const openRecipeSelector = useCallback(() => { setShowRecipeSelector(true); setAutoConnectTarget(null); setSelectorOpenedFrom('button'); }, []);
  const openRecipeSelectorForInput = useCallback((productId, nodeId, inputIndex, event) => {
    if (event?.ctrlKey) {
      // Ctrl+Click: Delete all edges connected to this input
      setEdges(eds => eds.filter(edge => 
        !(edge.target === nodeId && edge.targetHandle === `left-${inputIndex}`)
      ));
      return;
    }
    const product = getProduct(productId);
    if (product) { setShowRecipeSelector(true); setSelectedProduct(product); setAutoConnectTarget({ nodeId, inputIndex, productId }); setSelectorOpenedFrom('rectangle'); setRecipeFilter('producers'); }
  }, [setEdges]);
  const openRecipeSelectorForOutput = useCallback((productId, nodeId, outputIndex, event) => {
    if (event?.ctrlKey) {
      // Ctrl+Click: Delete all edges connected to this output
      setEdges(eds => eds.filter(edge => 
        !(edge.source === nodeId && edge.sourceHandle === `right-${outputIndex}`)
      ));
      return;
    }
    const product = getProduct(productId);
    if (product) { setShowRecipeSelector(true); setSelectedProduct(product); setAutoConnectTarget({ nodeId, outputIndex, productId, isOutput: true }); setSelectorOpenedFrom('rectangle'); setRecipeFilter('consumers'); }
  }, [setEdges]);

  const handleDrillSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    setLastDrillConfig({
      drillHead: settings.drillHead,
      consumable: settings.consumable,
      machineOil: settings.machineOil
    });
    
    const metrics = settings.drillHead && settings.depth ? calculateDrillMetrics(settings.drillHead, settings.consumable, settings.machineOil, settings.depth) : null;
    updateNodeData(nodeId, data => ({
      ...data, recipe: { ...data.recipe, inputs: inputs.length > 0 ? inputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
        outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }], drillSettings: settings, cycle_time: 1,
        power_consumption: metrics ? { max: metrics.drillingPower * 1000000, average: ((metrics.drillingPower * metrics.lifeTime + metrics.idlePower * (metrics.replacementTime + metrics.travelTime)) / metrics.totalCycleTime) * 1000000 } : 'Variable',
        pollution: metrics ? metrics.pollution : 'Variable' }, leftHandles: Math.max(inputs.length, 1), rightHandles: Math.max(outputs.length, 1)
    }));
    setEdges((eds) => eds.filter(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        const handleIndex = parseInt((edge.source === nodeId ? edge.sourceHandle : edge.targetHandle).split('-')[1]);
        return edge.source === nodeId ? handleIndex < outputs.length : handleIndex < inputs.length;
      }
      return true;
    }));
  }, [setEdges]);

  const handleLogicAssemblerSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    setLastAssemblerConfig({
      outerStage: settings.outerStage,
      innerStage: settings.innerStage,
      machineOil: settings.machineOil,
      tickCircuitDelay: settings.tickCircuitDelay
    });
    
    const getTargetMicrochip = () => !settings.outerStage || !settings.innerStage ? '' : settings.outerStage === 1 ? `p_${settings.innerStage}x_microchip` : `p_${settings.outerStage}x${settings.innerStage}x_microchip`;
    const targetMicrochip = getTargetMicrochip();
    const metrics = targetMicrochip ? calculateLogicAssemblerMetrics(targetMicrochip, settings.machineOil, settings.tickCircuitDelay) : null;
    updateNodeData(nodeId, data => ({
      ...data, recipe: { ...data.recipe, inputs: inputs.length > 0 ? inputs : [{ product_id: 'p_logic_plate', quantity: 'Variable' }, { product_id: 'p_copper_wire', quantity: 'Variable' },
        { product_id: 'p_semiconductor', quantity: 'Variable' }, { product_id: 'p_gold_wire', quantity: 'Variable' }],
        outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }], assemblerSettings: settings,
        cycle_time: metrics ? metrics.cycleTime : 'Variable', power_consumption: metrics ? { max: metrics.maxPowerConsumption, average: metrics.avgPowerConsumption } : 'Variable' },
        leftHandles: Math.max(inputs.length, 1), rightHandles: Math.max(outputs.length, 1)
    }));
    setEdges((eds) => eds.filter(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        const handleIndex = parseInt((edge.source === nodeId ? edge.sourceHandle : edge.targetHandle).split('-')[1]);
        return edge.source === nodeId ? handleIndex < outputs.length : handleIndex < inputs.length;
      }
      return true;
    }));
  }, [setEdges]);

  const handleTreeFarmSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    setLastTreeFarmConfig({
      trees: settings.trees,
      harvesters: settings.harvesters,
      sprinklers: settings.sprinklers,
      outputs: settings.outputs
    });
    
    const metrics = calculateTreeFarmMetrics(settings.trees, settings.harvesters, settings.sprinklers, settings.outputs, settings.controller, globalPollution);
    
    updateNodeData(nodeId, data => ({
      ...data, recipe: { ...data.recipe, inputs: inputs.length > 0 ? inputs : [{ product_id: 'p_water', quantity: 'Variable' }],
        outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_oak_log', quantity: 'Variable' }], treeFarmSettings: settings, cycle_time: 1,
        power_consumption: metrics ? metrics.avgPowerConsumption : 'Variable', pollution: 0 }, leftHandles: Math.max(inputs.length, 1), rightHandles: Math.max(outputs.length, 1)
    }));
    setEdges((eds) => eds.filter(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        const handleIndex = parseInt((edge.source === nodeId ? edge.sourceHandle : edge.targetHandle).split('-')[1]);
        return edge.source === nodeId ? handleIndex < outputs.length : handleIndex < inputs.length;
      }
      return true;
    }));
  }, [setEdges, globalPollution]);

  const handleIndustrialFireboxSettingsChange = useCallback((nodeId, settings, inputs, metrics) => {
    setLastFireboxConfig({
      fuel: settings.fuel
    });
    
    updateNodeData(nodeId, data => ({
      ...data, 
      recipe: { 
        ...data.recipe, 
        inputs,
        fireboxSettings: settings, 
        cycle_time: metrics ? metrics.cycleTime : data.recipe.cycle_time,
        power_consumption: 0 // No power consumption
      }
    }));
  }, []);

  const handleTemperatureSettingsChange = useCallback((nodeId, settings, outputs, powerConsumption) => {
    setNodes(nds => nds.map(n => 
      n.id === nodeId 
        ? { ...n, data: { ...n.data, recipe: { ...n.data.recipe, outputs, temperatureSettings: settings, power_consumption: powerConsumption !== null && powerConsumption !== undefined ? powerConsumption : n.data.recipe.power_consumption } } }
        : n
    ));
  }, [setNodes]);

  const handleBoilerSettingsChange = useCallback((nodeId, settings) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const machine = getMachine(n.data.recipe.machine_id);
      const heatSource = HEAT_SOURCES[machine?.id];
      if (!heatSource || heatSource.type !== 'boiler') return n;
      
      return { 
        ...n, 
        data: {
          ...n.data,
          recipe: { 
            ...n.data.recipe, 
            temperatureSettings: settings
          }
        }
      };
    }));
  }, [setNodes]);

  const handleChemicalPlantSettingsChange = useCallback((nodeId, settings) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      
      const machine = getMachine(n.data.recipe.machine_id);
      if (machine?.id !== 'm_chemical_plant') return n;
      
      // Get the base recipe (without any settings applied)
      const baseRecipe = recipes.find(r => r.id === n.data.recipe.id);
      if (!baseRecipe) return n;
      
      // Apply the new settings to the base recipe
      const updatedRecipe = applyChemicalPlantSettings(baseRecipe, settings.speedFactor, settings.efficiencyFactor);
      
      return {
        ...n,
        data: {
          ...n.data,
          recipe: updatedRecipe
        }
      };
    }));
  }, [setNodes]);

  const createRecipeBox = useCallback((recipe) => {
    const machine = getMachine(recipe.machine_id);
    if (!machine || !recipe.inputs || !recipe.outputs) { alert('Error: Invalid machine or recipe data'); return; }
    let recipeWithTemp = initializeRecipeTemperatures(recipe, machine.id);
    const newNodeId = `node-${nodeId}`;
    const targetNode = autoConnectTarget ? nodes.find(n => n.id === autoConnectTarget.nodeId) : null;
    const position = targetNode ? { x: targetNode.position.x + (autoConnectTarget.isOutput ? 400 : -400), y: targetNode.position.y } : { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 };
    
    const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';
    const isLogicAssembler = recipe.isLogicAssembler || recipe.id === 'r_logic_assembler';
    const isTreeFarm = recipe.isTreeFarm || recipe.id === 'r_tree_farm';
    
    const isBoiler = HEAT_SOURCES[machine.id]?.type === 'boiler';
    
    // For boilers, temporarily use hot temperature for machine count calculations
    if (isBoiler) {
      const settingsWithCoolant = {
        heatLoss: recipeWithTemp.temperatureSettings?.heatLoss ?? 8,
        coolantTemp: DEFAULT_BOILER_INPUT_TEMPERATURE
      };
      
      const outputTemp = calculateOutputTemperature(machine.id, settingsWithCoolant, DEFAULT_BOILER_INPUT_TEMPERATURE, null, DEFAULT_BOILER_INPUT_TEMPERATURE);
      const heatSource = HEAT_SOURCES[machine.id];
      const updatedOutputs = applyTemperatureToOutputs(recipeWithTemp.outputs, outputTemp, true, heatSource, DEFAULT_BOILER_INPUT_TEMPERATURE);
      
      recipeWithTemp = {
        ...recipeWithTemp,
        outputs: updatedOutputs,
        temperatureSettings: settingsWithCoolant
      };
    }
    
    let drillSettings = null;
    let drillInputs = recipe.inputs;
    let drillOutputs = recipe.outputs;
    
    if (isMineshaftDrill) {
      const defaultDrillHead = lastDrillConfig?.drillHead || 'steel';
      const defaultConsumable = lastDrillConfig?.consumable || 'hydrochloric_acid';
      const defaultMachineOil = lastDrillConfig?.machineOil !== undefined ? lastDrillConfig.machineOil : true;
      
      // Check if the searched product is a drill head
      const drillHeadIds = ['p_copper_drill_head', 'p_iron_drill_head', 'p_steel_drill_head', 'p_tungsten_carbide_drill_head'];
      const drillHeadMap = {
        'p_copper_drill_head': 'copper',
        'p_iron_drill_head': 'iron',
        'p_steel_drill_head': 'steel',
        'p_tungsten_carbide_drill_head': 'tungsten_carbide'
      };
      
      // Get the product ID either from autoConnectTarget or selectedProduct
      const searchedProductId = autoConnectTarget?.productId || selectedProduct?.id;
      
      if (searchedProductId) {
        // If user searched for a drill head, use that drill head
        if (drillHeadIds.includes(searchedProductId)) {
          const lastUsedDepth = nodes.find(n => n.data?.recipe?.drillSettings?.depth)?.data.recipe.drillSettings.depth || 100;
          drillSettings = {
            drillHead: drillHeadMap[searchedProductId],
            consumable: defaultConsumable,
            machineOil: defaultMachineOil,
            depth: lastUsedDepth
          };
        }
        // If user is connecting to an output, use last depth
        else if (autoConnectTarget?.isOutput) {
          const lastUsedDepth = nodes.find(n => n.data?.recipe?.drillSettings?.depth)?.data.recipe.drillSettings.depth || 100;
          drillSettings = {
            drillHead: defaultDrillHead,
            consumable: defaultConsumable,
            machineOil: defaultMachineOil,
            depth: lastUsedDepth
          };
        } 
        // If user searched for an output product, find best depth
        else {
          const bestDepth = findBestDepthForProduct(searchedProductId, defaultDrillHead, defaultConsumable, defaultMachineOil);
          
          if (bestDepth) {
            drillSettings = {
              drillHead: defaultDrillHead,
              consumable: defaultConsumable,
              machineOil: defaultMachineOil,
              depth: bestDepth
            };
          }
        }
      } else {
        const lastUsedDepth = nodes.find(n => n.data?.recipe?.drillSettings?.depth)?.data.recipe.drillSettings.depth || 100;
        drillSettings = {
          drillHead: defaultDrillHead,
          consumable: defaultConsumable,
          machineOil: defaultMachineOil,
          depth: lastUsedDepth
        };
      }
      
      if (drillSettings) {
        drillInputs = buildDrillInputs(drillSettings.drillHead, drillSettings.consumable, drillSettings.machineOil, drillSettings.depth);
        drillOutputs = buildDrillOutputs(drillSettings.drillHead, drillSettings.consumable, drillSettings.machineOil, drillSettings.depth);
        const metrics = calculateDrillMetrics(drillSettings.drillHead, drillSettings.consumable, drillSettings.machineOil, drillSettings.depth);
        
        recipeWithTemp = {
          ...recipeWithTemp,
          inputs: drillInputs.length > 0 ? drillInputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
          outputs: drillOutputs.length > 0 ? drillOutputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
          drillSettings,
          cycle_time: 1,
          power_consumption: metrics ? { max: metrics.drillingPower * 1000000, average: ((metrics.drillingPower * metrics.lifeTime + metrics.idlePower * (metrics.replacementTime + metrics.travelTime)) / metrics.totalCycleTime) * 1000000 } : 'Variable',
          pollution: metrics ? metrics.pollution : 'Variable'
        };
      }
    }
    
    let assemblerSettings = null;
    let assemblerInputs = recipe.inputs;
    let assemblerOutputs = recipe.outputs;
    
    if (isLogicAssembler) {
      const defaultOuterStage = lastAssemblerConfig?.outerStage || 1;
      const defaultInnerStage = lastAssemblerConfig?.innerStage || 2;
      const defaultMachineOil = lastAssemblerConfig?.machineOil !== undefined ? lastAssemblerConfig.machineOil : true;
      const defaultTickCircuitDelay = lastAssemblerConfig?.tickCircuitDelay || 0;
      
      let targetMicrochip = defaultOuterStage === 1 ? `p_${defaultInnerStage}x_microchip` : `p_${defaultOuterStage}x${defaultInnerStage}x_microchip`;
      
      if (autoConnectTarget) {
        if (autoConnectTarget.productId.includes('microchip')) {
          targetMicrochip = autoConnectTarget.productId;
          const match = autoConnectTarget.productId.match(/p_(?:(\d+)x)?(\d+)x_microchip/);
          if (match) {
            const outerStage = match[1] ? parseInt(match[1]) : 1;
            const innerStage = parseInt(match[2]);
            assemblerSettings = {
              outerStage,
              innerStage,
              machineOil: defaultMachineOil,
              tickCircuitDelay: defaultTickCircuitDelay
            };
          }
        } else {
          assemblerSettings = {
            outerStage: defaultOuterStage,
            innerStage: defaultInnerStage,
            machineOil: defaultMachineOil,
            tickCircuitDelay: defaultTickCircuitDelay
          };
        }
      } else {
        assemblerSettings = {
          outerStage: defaultOuterStage,
          innerStage: defaultInnerStage,
          machineOil: defaultMachineOil,
          tickCircuitDelay: defaultTickCircuitDelay
        };
      }
      
      if (assemblerSettings) {
        assemblerInputs = buildLogicAssemblerInputs(targetMicrochip, assemblerSettings.machineOil);
        assemblerOutputs = buildLogicAssemblerOutputs(targetMicrochip, assemblerSettings.machineOil);
        const metrics = calculateLogicAssemblerMetrics(targetMicrochip, assemblerSettings.machineOil, assemblerSettings.tickCircuitDelay);
        
        recipeWithTemp = {
          ...recipeWithTemp,
          inputs: assemblerInputs.length > 0 ? assemblerInputs : [{ product_id: 'p_logic_plate', quantity: 'Variable' }, { product_id: 'p_copper_wire', quantity: 'Variable' }, { product_id: 'p_semiconductor', quantity: 'Variable' }, { product_id: 'p_gold_wire', quantity: 'Variable' }],
          outputs: assemblerOutputs.length > 0 ? assemblerOutputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
          assemblerSettings,
          cycle_time: metrics ? metrics.cycleTime : 'Variable',
          power_consumption: metrics ? { max: metrics.maxPowerConsumption, average: metrics.avgPowerConsumption } : 'Variable'
        };
      }
    }

    let treeFarmSettings = null;
    let treeFarmInputs = recipe.inputs;
    let treeFarmOutputs = recipe.outputs;
    
    if (isTreeFarm) {
      const defaultTrees = lastTreeFarmConfig?.trees || 450;
      const defaultHarvesters = lastTreeFarmConfig?.harvesters || 20;
      const defaultSprinklers = lastTreeFarmConfig?.sprinklers || 24;
      const defaultOutputs = lastTreeFarmConfig?.outputs || 8;
      const defaultController = 1;
      
      treeFarmSettings = {
        trees: defaultTrees,
        harvesters: defaultHarvesters,
        sprinklers: defaultSprinklers,
        outputs: defaultOutputs,
        controller: defaultController
      };
      
      treeFarmInputs = buildTreeFarmInputs(defaultSprinklers);
      treeFarmOutputs = buildTreeFarmOutputs(defaultTrees, defaultHarvesters, globalPollution);
      const metrics = calculateTreeFarmMetrics(defaultTrees, defaultHarvesters, defaultSprinklers, defaultOutputs, defaultController, globalPollution);
      
      recipeWithTemp = {
        ...recipeWithTemp,
        inputs: treeFarmInputs.length > 0 ? treeFarmInputs : [{ product_id: 'p_water', quantity: 'Variable' }],
        outputs: treeFarmOutputs.length > 0 ? treeFarmOutputs : [{ product_id: 'p_oak_log', quantity: 'Variable' }],
        treeFarmSettings,
        cycle_time: 1,
        power_consumption: metrics ? metrics.avgPowerConsumption : 'Variable',
        pollution: 0
      };
    }

    // Initialize air separation unit with pollution-based residue
    if (machine.id === 'm_air_separation_unit') {
      const residueAmount = calculateResidueAmount(globalPollution);
      const updatedOutputs = recipeWithTemp.outputs.map(output => {
        if (output.product_id === 'p_residue') {
          return { ...output, quantity: parseFloat(residueAmount.toFixed(6)) };
        }
        return output;
      });
      
      recipeWithTemp = {
        ...recipeWithTemp,
        outputs: updatedOutputs
      };
    }

    // Initialize industrial firebox with default fuel (only for recipes with variable fuel input)
    const hasVariableFuelInput = recipe.inputs?.some(input => input.product_id === 'p_variableproduct');
    if (machine.id === 'm_industrial_firebox' && isIndustrialFireboxRecipe(recipe.id) && hasVariableFuelInput) {
      // Check if the searched product is a fuel
      const fuelProductIds = ['p_coal', 'p_coke_fuel', 'p_planks', 'p_oak_log'];
      let fuelToUse = lastFireboxConfig?.fuel || 'p_coke_fuel';
      
      // Get the product ID either from autoConnectTarget or selectedProduct
      const searchedProductId = autoConnectTarget?.productId || selectedProduct?.id;
      
      // If user searched for a fuel product, use that fuel
      if (searchedProductId && fuelProductIds.includes(searchedProductId)) {
        fuelToUse = searchedProductId;
      }
      
      const metrics = calculateFireboxMetrics(recipe.id, fuelToUse);
      
      if (metrics) {
        const fireboxInputs = buildFireboxInputs(recipe.inputs, fuelToUse, recipe.id);
        const fireboxSettings = { fuel: fuelToUse };
        
        recipeWithTemp = {
          ...recipeWithTemp,
          inputs: fireboxInputs,
          fireboxSettings,
          cycle_time: metrics.cycleTime,
          power_consumption: 0 // No power consumption
        };
      }
    }
    
    const calculatedMachineCount = recipeMachineCounts[recipe.id] || 1;
    
    const newNode = { id: newNodeId, type: 'custom', position, data: { recipe: recipeWithTemp, machine, machineCount: calculatedMachineCount, displayMode, machineDisplayMode,
      leftHandles: recipeWithTemp.inputs.length, rightHandles: recipeWithTemp.outputs.length, onInputClick: openRecipeSelectorForInput, onOutputClick: openRecipeSelectorForOutput,
      onDrillSettingsChange: handleDrillSettingsChange, onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange, onTreeFarmSettingsChange: handleTreeFarmSettingsChange,
      onIndustrialFireboxSettingsChange: handleIndustrialFireboxSettingsChange, onTemperatureSettingsChange: handleTemperatureSettingsChange, 
      onBoilerSettingsChange: handleBoilerSettingsChange, onChemicalPlantSettingsChange: handleChemicalPlantSettingsChange, globalPollution, isTarget: false }, sourcePosition: 'right', targetPosition: 'left' };
        
    setNodes((nds) => {
      const updatedNodes = [...nds, newNode];
      if (autoConnectTarget) {
        setTimeout(() => {
          const searchKey = autoConnectTarget.isOutput ? 'inputs' : 'outputs';
          const index = recipeWithTemp[searchKey].findIndex(item => item.product_id === autoConnectTarget.productId);
          if (index !== -1) {
            const sourceHandleIndex = autoConnectTarget.isOutput ? autoConnectTarget.outputIndex : index;
            const targetHandleIndex = autoConnectTarget.isOutput ? index : autoConnectTarget.inputIndex;
            const newEdge = { source: autoConnectTarget.isOutput ? autoConnectTarget.nodeId : newNodeId, sourceHandle: `right-${sourceHandleIndex}`,
              target: autoConnectTarget.isOutput ? newNodeId : autoConnectTarget.nodeId, targetHandle: `left-${targetHandleIndex}`, type: 'custom', animated: false };
            setEdges((eds) => addEdge(newEdge, eds));
          }
        }, 50);
      }
      return updatedNodes;
    });
    setNodeId((id) => id + 1);
    resetSelector();
  }, [nodeId, nodes, setNodes, setEdges, openRecipeSelectorForInput, openRecipeSelectorForOutput, handleDrillSettingsChange, handleLogicAssemblerSettingsChange, 
    handleTreeFarmSettingsChange, handleIndustrialFireboxSettingsChange, handleTemperatureSettingsChange, handleBoilerSettingsChange, autoConnectTarget, displayMode, 
    machineDisplayMode, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig, findBestDepthForProduct, recipeMachineCounts, globalPollution]);

  const deleteRecipeBoxAndTarget = useCallback((boxId) => {
    setNodes((nds) => nds.filter((n) => n.id !== boxId)); setEdges((eds) => eds.filter((e) => e.source !== boxId && e.target !== boxId));
    setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== boxId));
  }, [setNodes, setEdges]);

  const toggleTargetStatus = useCallback((node) => {
    const existingTarget = targetProducts.find(t => t.recipeBoxId === node.id);
    if (existingTarget) { setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== node.id)); updateNodeData(node.id, data => ({ ...data, isTarget: false })); }
    else if (node.data?.recipe?.outputs?.length > 0) {
      setTargetProducts(prev => [...prev, { id: `target_${targetIdCounter}`, recipeBoxId: node.id, productId: node.data.recipe.outputs[0].product_id, desiredAmount: 0 }]);
      setTargetIdCounter(prev => prev + 1); updateNodeData(node.id, data => ({ ...data, isTarget: true }));
    }
  }, [targetProducts, targetIdCounter]);

  const onNodeClick = useCallback((event, node) => {
    if (event.shiftKey && !event.ctrlKey && !event.altKey) toggleTargetStatus(node);
    else if (event.ctrlKey && event.altKey) deleteRecipeBoxAndTarget(node.id);
  }, [toggleTargetStatus, deleteRecipeBoxAndTarget]);

  const onNodeDoubleClick = useCallback((event, node) => {
    event.stopPropagation(); setEditingNodeId(node.id); setEditingMachineCount(String(node.data?.machineCount ?? 0)); setShowMachineCountEditor(true);
  }, []);

  const handleMachineCountUpdate = useCallback(() => {
    let value = parseFloat(editingMachineCount);
    if (isNaN(value) || value <= 0) { value = 1; }
    
    if (editingNodeId) {
      updateNodeData(editingNodeId, data => ({ ...data, machineCount: value }));
    }
    
    setShowMachineCountEditor(false); 
    setEditingNodeId(null); 
    setEditingMachineCount('');
    setNewNodePendingMachineCount(null);
  }, [editingNodeId, editingMachineCount]);

  const handleMachineCountCancel = useCallback(() => {
    if (newNodePendingMachineCount) {
      // Delete the newly created node
      deleteRecipeBoxAndTarget(newNodePendingMachineCount);
    }
    setShowMachineCountEditor(false);
    setEditingNodeId(null);
    setEditingMachineCount('');
    setNewNodePendingMachineCount(null);
  }, [newNodePendingMachineCount, deleteRecipeBoxAndTarget]);

  const handleCompute = useCallback(() => alert('Computation to come soon!'), []);
  const handleExtendedPanelToggle = useCallback(() => {
    if (extendedPanelOpen) { setExtendedPanelClosing(true); setTimeout(() => { setExtendedPanelOpen(false); setExtendedPanelClosing(false); }, 300); }
    else setExtendedPanelOpen(true);
  }, [extendedPanelOpen]);

  const getAvailableRecipes = () => {
    if (!selectedProduct) return [];
    const producers = getRecipesProducingProductFiltered(selectedProduct.id);
    const consumers = getRecipesUsingProduct(selectedProduct.id);
    const isDrillInput = canDrillUseProduct(selectedProduct.id);
    const isDrillOutput = Object.values(DEPTH_OUTPUTS).some(outputs => outputs.some(o => o.product_id === selectedProduct.id));
    const isAssemblerInput = ['p_logic_plate', 'p_copper_wire', 'p_semiconductor', 'p_gold_wire', 'p_machine_oil'].includes(selectedProduct.id);
    const isAssemblerOutput = MICROCHIP_STAGES.some(stage => stage.productId === selectedProduct.id);
    const isTreeFarmInput = selectedProduct.id === 'p_water';
    const isTreeFarmOutput = selectedProduct.id === 'p_oak_log';
    if (recipeFilter === 'producers') return [...producers, ...(isDrillOutput ? [DEFAULT_DRILL_RECIPE] : []), ...(isAssemblerOutput ? [DEFAULT_LOGIC_ASSEMBLER_RECIPE] : []), ...(isTreeFarmOutput ? [DEFAULT_TREE_FARM_RECIPE] : [])];
    if (recipeFilter === 'consumers') return [...consumers, ...(isDrillInput ? [DEFAULT_DRILL_RECIPE] : []), ...(isAssemblerInput ? [DEFAULT_LOGIC_ASSEMBLER_RECIPE] : []), ...(isTreeFarmInput ? [DEFAULT_TREE_FARM_RECIPE] : [])];
    return Array.from(new Map([...producers, ...consumers, ...((isDrillInput || isDrillOutput) ? [DEFAULT_DRILL_RECIPE] : []), 
      ...((isAssemblerInput || isAssemblerOutput) ? [DEFAULT_LOGIC_ASSEMBLER_RECIPE] : []), ...((isTreeFarmInput || isTreeFarmOutput) ? [DEFAULT_TREE_FARM_RECIPE] : [])].map(r => [r.id, r])).values());
  };

  useEffect(() => {
    if (showRecipeSelector) {
      const availableRecipes = selectorMode === 'product' 
        ? getAvailableRecipes() 
        : getRecipesForMachine(selectedMachine?.id);
      
      const targetNode = autoConnectTarget ? nodes.find(n => n.id === autoConnectTarget.nodeId) : null;
      
      const newCounts = {};
      availableRecipes.forEach(recipe => {
        const calculatedCount = calculateMachineCountForRecipe(recipe, targetNode, autoConnectTarget);
        newCounts[recipe.id] = calculatedCount;
      });
      
      setRecipeMachineCounts(newCounts);
    }
  }, [showRecipeSelector, selectorMode, selectedProduct, selectedMachine, autoConnectTarget, nodes, recipeFilter]);

  const handleImport = useCallback(() => fileInputRef.current?.click(), []);
  const processImport = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        const productMap = new Map((imported.products || []).map(p => [p.id, p]));
        const uniqueProducts = Array.from(productMap.values());
        const machineIds = new Set(imported.machines?.map(m => m.id) || []);
        const cleanedRecipes = (imported.recipes || []).filter(r => machineIds.has(r.machine_id));
        const currentProducts = [...products];
        uniqueProducts.forEach(newProduct => {
          const existingIndex = currentProducts.findIndex(p => p.id === newProduct.id);
          existingIndex >= 0 ? (currentProducts[existingIndex] = newProduct) : currentProducts.push(newProduct);
        });
        updateProducts(currentProducts);
        if (imported.machines?.length > 0) {
          const currentMachines = [...machines];
          const importedMachineIdSet = new Set(imported.machines.map(m => m.id));
          const recipesWithoutImportedMachines = recipes.filter(r => !importedMachineIdSet.has(r.machine_id));
          imported.machines.forEach(newMachine => {
            const existingIndex = currentMachines.findIndex(m => m.id === newMachine.id);
            existingIndex >= 0 ? (currentMachines[existingIndex] = newMachine) : currentMachines.push(newMachine);
          });
          updateMachines(currentMachines); updateRecipes([...recipesWithoutImportedMachines, ...cleanedRecipes]);
        }
        if (imported.canvas && window.confirm('Clear current canvas and load imported layout?')) {
          const restoredNodes = (imported.canvas.nodes || []).map(node => ({ ...node, data: { ...node.data, machineCount: node.data.machineCount ?? 1, displayMode, machineDisplayMode,
            onInputClick: openRecipeSelectorForInput, onOutputClick: openRecipeSelectorForOutput, onDrillSettingsChange: handleDrillSettingsChange,
            onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange, onTreeFarmSettingsChange: handleTreeFarmSettingsChange, 
            onIndustrialFireboxSettingsChange: handleIndustrialFireboxSettingsChange, onTemperatureSettingsChange: handleTemperatureSettingsChange, 
            onBoilerSettingsChange: handleBoilerSettingsChange }}));
          setNodes(restoredNodes); setEdges(imported.canvas.edges || []); setTargetProducts(imported.canvas.targetProducts || []);
          setSoldProducts(imported.canvas.soldProducts || {}); setFavoriteRecipes(imported.canvas.favoriteRecipes || []); 
          setLastDrillConfig(imported.canvas.lastDrillConfig || null); setLastAssemblerConfig(imported.canvas.lastAssemblerConfig || null);
          setLastTreeFarmConfig(imported.canvas.lastTreeFarmConfig || null); setLastFireboxConfig(imported.canvas.lastFireboxConfig || null);
          setNodeId(imported.canvas.nodeId || 0); setTargetIdCounter(imported.canvas.targetIdCounter || 0);
        }
        alert('Import successful!'); window.location.reload();
      } catch (error) { alert(`Import failed: ${error.message}`); }
    };
    reader.readAsText(file); event.target.value = '';
  }, [setNodes, setEdges, openRecipeSelectorForInput, openRecipeSelectorForOutput, handleDrillSettingsChange, handleLogicAssemblerSettingsChange, 
    handleTreeFarmSettingsChange, handleIndustrialFireboxSettingsChange, handleTemperatureSettingsChange, handleBoilerSettingsChange, displayMode, machineDisplayMode]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify({ products, machines, recipes, canvas: { nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts, favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig } }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `industrialist-export-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts, favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig]);

  const handleRestoreDefaults = useCallback(() => {
    if (window.confirm('Restore all data to defaults? This will clear the canvas and reset all products, machines, and recipes.')) {
      restoreDefaults(); setNodes([]); setEdges([]); setNodeId(0); setTargetProducts([]); setTargetIdCounter(0); setSoldProducts({}); setFavoriteRecipes([]); setLastDrillConfig(null); setLastAssemblerConfig(null); setLastTreeFarmConfig(null); setLastFireboxConfig(null); window.location.reload();
    }
  }, [setNodes, setEdges]);

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) && (filterType === 'all' || p.type === filterType)).sort((a, b) => {
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
    if (sortBy === 'price_asc') return (a.price === 'Variable' ? Infinity : a.price) - (b.price === 'Variable' ? Infinity : b.price);
    if (sortBy === 'price_desc') return (b.price === 'Variable' ? -Infinity : b.price) - (a.price === 'Variable' ? -Infinity : a.price);
    if (sortBy === 'rp_asc') return (a.rp_multiplier === 'Variable' ? Infinity : a.rp_multiplier) - (b.rp_multiplier === 'Variable' ? Infinity : b.rp_multiplier);
    return (b.rp_multiplier === 'Variable' ? -Infinity : b.rp_multiplier) - (a.rp_multiplier === 'Variable' ? -Infinity : a.rp_multiplier);
  });

  const filteredMachines = machines.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    (m.id === 'm_mineshaft_drill' || m.id === 'm_logic_assembler' || getRecipesForMachine(m.id).length > 0)).sort((a, b) => a.name.localeCompare(b.name));

  const handleMachineSelect = (machine) => {
    if (machine.id === 'm_mineshaft_drill') createRecipeBox(DEFAULT_DRILL_RECIPE);
    else if (machine.id === 'm_logic_assembler') createRecipeBox(DEFAULT_LOGIC_ASSEMBLER_RECIPE);
    else if (machine.id === 'm_tree_farm') createRecipeBox(DEFAULT_TREE_FARM_RECIPE);
    else setSelectedMachine(machine);
  };

  const availableRecipes = (selectorMode === 'product' ? getAvailableRecipes() : getRecipesForMachine(selectedMachine?.id))
    .sort((a, b) => {
      const aIsFavorite = favoriteRecipes.includes(a.id);
      const bIsFavorite = favoriteRecipes.includes(b.id);
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      const machineA = getMachine(a.machine_id);
      const machineB = getMachine(b.machine_id);
      return (machineA?.name || '').localeCompare(machineB?.name || '');
    });

  const toggleFavoriteRecipe = (recipeId) => {
    setFavoriteRecipes(prev => 
      prev.includes(recipeId) ? prev.filter(id => id !== recipeId) : [...prev, recipeId]
    );
  };

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow ref={reactFlowWrapper} nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} 
        onNodeClick={onNodeClick} onNodeDoubleClick={onNodeDoubleClick} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView>
        <Background color="#333" gap={16} size={1} />
        <Controls className={(extendedPanelOpen || extendedPanelClosing) && !leftPanelCollapsed ? 'controls-shifted' : ''} />
        <MiniMap nodeColor={() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()}
          maskColor={getComputedStyle(document.documentElement).getPropertyValue('--bg-overlay').trim()} />
        
        <Panel position="top-left" style={{ margin: '10px' }}>
          <div className={`left-panel-container ${leftPanelCollapsed ? 'collapsed' : ''}`}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                <div className="stats-panel">
                  <h3 className="stats-title">{statisticsTitle}</h3>
                  <div className="stats-grid">
                    <div className="stat-item"><div className="stat-label">Total Power:</div><div className="stat-value">{formatPowerDisplay(stats.totalPower)}</div></div>
                    <div className="stat-item"><div className="stat-label">Total Pollution:</div><div className="stat-value">{stats.totalPollution.toFixed(2)}%/hr</div></div>
                    <div className="stat-item"><div className="stat-label">Total Minimum Model Count:</div><div className="stat-value">{stats.totalModelCount.toFixed(0)}</div></div>
                    <div className="stat-item"><div className="stat-label">Total Profit:</div><div className="stat-value" style={{ color: totalProfit >= 0 ? '#86efac' : '#fca5a5' }}>
                      ${metricFormat(totalProfit)}/s</div></div>
                  </div>
                </div>
                <div className="flex-col action-buttons-container">
                  <button onClick={openRecipeSelector} className="btn btn-primary">+ Select Recipe</button>
                  <button onClick={() => setShowTargetsModal(true)} className="btn btn-secondary">View Targets ({targetProducts.length})</button>
                  <button onClick={handleCompute} className="btn btn-secondary">Compute Machines</button>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setExtendedPanelOpen(!extendedPanelOpen)} className="btn btn-secondary btn-square"
                      title={extendedPanelOpen ? "Close more statistics" : "Open more statistics"}>{extendedPanelOpen ? '↓' : '↑'}</button>
                    <button onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)} className="btn btn-secondary btn-square btn-panel-toggle"
                      title={leftPanelCollapsed ? "Show left panel" : "Hide left panel"}>{leftPanelCollapsed ? '→' : '←'}</button>
                  </div>
                </div>
              </div>
              
              {(extendedPanelOpen || extendedPanelClosing) && (
                <div className={`extended-panel ${extendedPanelClosing ? 'closing' : ''}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px', borderBottom: '2px solid var(--border-divider)',
                    position: 'sticky', top: 0, background: 'var(--bg-secondary)', zIndex: 1 }}>
                    <h3 style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-md)', fontWeight: 700, margin: 0 }}>More Statistics</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setDisplayMode(prev => prev === 'perSecond' ? 'perCycle' : 'perSecond')} className="btn btn-secondary"
                        style={{ padding: '8px 16px', fontSize: 'var(--font-size-base)', minWidth: 'auto' }}
                        title={displayMode === 'perSecond' ? 'Switch to per-cycle display' : 'Switch to per-second display'}>
                        {displayMode === 'perSecond' ? 'Per Second' : 'Per Cycle'}</button>
                      <button onClick={() => setMachineDisplayMode(prev => prev === 'perMachine' ? 'total' : 'perMachine')} className="btn btn-secondary"
                        style={{ padding: '8px 16px', fontSize: 'var(--font-size-base)', minWidth: 'auto' }}
                        title={machineDisplayMode === 'perMachine' ? 'Switch to total display' : 'Switch to per-machine display'}>
                        {machineDisplayMode === 'perMachine' ? 'Per Machine' : 'Total'}</button>
                    </div>
                  </div>
                  <div className="extended-panel-content" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingBottom: '120px' }}>
                    <div style={{ marginBottom: '20px' }}>
                      <label htmlFor="global-pollution" style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                        Global Pollution (%):</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button 
                          onClick={() => setIsPollutionPaused(prev => !prev)}
                          className="btn btn-secondary"
                          style={{ 
                            padding: '10px 16px', 
                            minWidth: 'auto',
                            fontSize: 'var(--font-size-lg)',
                            lineHeight: 1
                          }}
                          title={isPollutionPaused ? 'Resume pollution increase' : 'Pause pollution increase'}
                        >
                          {isPollutionPaused ? '▶' : '⏸'}
                        </button>
                        <input 
                          id="global-pollution" 
                          type="text" 
                          value={globalPollution} 
                          onFocus={() => setPollutionInputFocused(true)}
                          onBlur={(e) => { 
                            setPollutionInputFocused(false); 
                            const val = e.target.value; 
                            const num = parseFloat(val);
                            setGlobalPollution(!isNaN(num) && isFinite(num) ? parseFloat(num.toFixed(4)) : 0); 
                          }}
                          onChange={(e) => setGlobalPollution(e.target.value)} 
                          className="input" 
                          placeholder="Enter global pollution" 
                          style={{ flex: 1, textAlign: 'left' }} 
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: '30px' }}>
                      <h4 style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: '12px' }}>Excess Products:</h4>
                      {excessProducts.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', padding: '15px', textAlign: 'center', 
                          background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>No excess products. All outputs are consumed by connected inputs.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {excessProducts.map(item => (
                            <div key={item.productId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px',
                              background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: item.isSold ? '2px solid var(--color-primary)' : '2px solid var(--border-light)' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{item.product.name}</div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>{metricFormat(item.excessRate)}/s</div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {typeof item.product.price === 'number' && (
                                  <div style={{ color: item.isSold ? 'var(--color-primary)' : 'var(--text-muted)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                                    ${metricFormat(item.product.price * item.excessRate)}/s</div>
                                )}
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)' }}>
                                  <input type="checkbox" checked={item.isSold} onChange={(e) => setSoldProducts(prev => ({ ...prev, [item.productId]: e.target.checked }))}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-primary)' }} />Sell
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: '30px' }}>
                      <h4 style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: '12px' }}>Deficient Products:</h4>
                      {deficientProducts.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', padding: '15px', textAlign: 'center',
                          background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>No deficient products. All inputs are fully supplied by connected outputs.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {deficientProducts.map(item => (
                            <div key={item.productId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px',
                              background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '2px solid #fca5a5' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{item.product.name}</div>
                                <div style={{ color: '#fca5a5', fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>Shortage: {metricFormat(item.deficiencyRate)}/s</div>
                              </div>
                              <div style={{ color: '#fca5a5', fontSize: 'var(--font-size-xs)', fontWeight: 600, textAlign: 'right' }}>
                                {item.affectedNodes.length} node{item.affectedNodes.length !== 1 ? 's' : ''} affected</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: '30px' }}>
                      <h4 style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: '12px' }}>Machine Costs:</h4>
                      {machineStats.stats.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', padding: '15px', textAlign: 'center',
                          background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)' }}>No machines on canvas.</div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                            {machineStats.stats.map(stat => (
                              <div key={stat.machineId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px',
                                background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '2px solid var(--border-light)' }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{stat.machine.name}</div>
                                  <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: '2px' }}>
                                    Count: {stat.count} × ${metricFormat(stat.cost)}</div>
                                </div>
                                <div style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>${metricFormat(stat.totalCost)}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ padding: '12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', border: '2px solid var(--color-primary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 700 }}>Total Cost:</div>
                              <div style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-md)', fontWeight: 700 }}>${metricFormat(machineStats.totalCost)}</div>
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', fontStyle: 'italic', textAlign: 'center' }}>
                              For machines only. Poles and pipes not accounted for.</div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel position="top-right" style={{ margin: '10px' }}>
          <div className={`menu-container ${menuOpen ? '' : 'closed'}`}>
            <button onClick={() => setMenuOpen(!menuOpen)} className="btn btn-secondary btn-menu-toggle">{menuOpen ? '>' : '<'}</button>
            <div className="menu-buttons">
              <button onClick={() => { setNodes([]); setEdges([]); setNodeId(0); setTargetProducts([]); setTargetIdCounter(0); setSoldProducts({}); setLastDrillConfig(null); setLastAssemblerConfig(null); }} 
                className="btn btn-secondary">Clear All</button>
              <button onClick={handleImport} className="btn btn-secondary">Import JSON</button>
              <button onClick={handleExport} className="btn btn-secondary">Export JSON</button>
              <button onClick={handleRestoreDefaults} className="btn btn-secondary">Restore Defaults</button>
              <button onClick={() => setShowThemeEditor(true)} className="btn btn-secondary">Theme Editor</button>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={processImport} />

      {(showMachineCountEditor || keepOverlayDuringTransition) && (
        <div className="modal-overlay" onClick={handleMachineCountCancel}>
          {showMachineCountEditor && (
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
              <h2 className="modal-title">Edit Machine Count</h2>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: '10px' }}>
                  Machine Count:</label>
                <input type="number" min="0" step="0.1" value={editingMachineCount} onChange={(e) => setEditingMachineCount(e.target.value)}
                  onKeyPress={(e) => { if (e.key === 'Enter') handleMachineCountUpdate(); }} className="input" placeholder="Enter machine count" autoFocus />
                <p style={{ marginTop: '8px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Must be a non-negative number (can be decimal)</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleMachineCountCancel} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button onClick={handleMachineCountUpdate} className="btn btn-primary" style={{ flex: 1 }}>Apply</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showRecipeSelector && (
        <div className="modal-overlay" onClick={resetSelector}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{selectedProduct ? `Recipes for ${selectedProduct.name}` : selectedMachine ? `Recipes for ${selectedMachine.name}` : 'Select Product or Machine'}</h2>
            {!selectedProduct && !selectedMachine ? (
              <>
                <div className="mb-lg">
                  <div className="flex-row" style={{ gap: '10px', marginBottom: '15px' }}>
                    <button onClick={() => setSelectorMode('product')} className={`btn ${selectorMode === 'product' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}>
                      By Products</button>
                    <button onClick={() => setSelectorMode('machine')} className={`btn ${selectorMode === 'machine' ? 'btn-primary' : 'btn-secondary'}`} style={{ flex: 1 }}>
                      By Machines</button>
                  </div>
                </div>
                {selectorMode === 'product' ? (
                  <>
                    <div className="mb-lg flex-col">
                      <input type="text" placeholder="Search products..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input" />
                      <div className="flex-row">
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="select">
                          <option value="all">All Types</option><option value="item">Items Only</option><option value="fluid">Fluids Only</option>
                        </select>
                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="select">
                          <option value="name_asc">Name ↑ (A-Z)</option><option value="name_desc">Name ↓ (Z-A)</option>
                          <option value="price_asc">Price ↑ (Low-High)</option><option value="price_desc">Price ↓ (High-Low)</option>
                          <option value="rp_asc">RP Mult ↑ (Low-High)</option><option value="rp_desc">RP Mult ↓ (High-Low)</option>
                        </select>
                      </div>
                    </div>
                    <div className="modal-content" style={{ maxHeight: '400px' }}>
                      <div className="product-table-header"><div>Product</div><div className="text-right">Price</div><div className="text-right">RP Mult</div></div>
                      {filteredProducts.map(product => (
                        <div key={product.id} onClick={() => setSelectedProduct(product)} className="product-row">
                          <div><div className="product-name">{product.name}</div><div className="product-type">{product.type === 'item' ? '📦 Item' : '💧 Fluid'}</div></div>
                          <div className="text-right" style={{ alignSelf: 'center' }}>{product.price === 'Variable' ? 'Variable' : `${metricFormat(product.price)}`}</div>
                          <div className="text-right" style={{ alignSelf: 'center' }}>
                            {product.rp_multiplier === 'Variable' ? 'Variable' : product.rp_multiplier >= 1000 ? `${metricFormat(product.rp_multiplier)}x` : `${product.rp_multiplier.toFixed(1)}x`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-lg"><input type="text" placeholder="Search machines..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input" /></div>
                    <div className="modal-content flex-col" style={{ maxHeight: '400px' }}>
                      {filteredMachines.length === 0 ? <div className="empty-state">No machines found</div> : filteredMachines.map(machine => (
                        <div key={machine.id} onClick={() => handleMachineSelect(machine)} className="recipe-card" style={{ cursor: 'pointer' }}>
                          <div className="recipe-machine">{machine.name}</div>
                          <div className="recipe-details" style={{ color: '#999' }}>
                            {machine.id === 'm_mineshaft_drill' || machine.id === 'm_logic_assembler' ? 'Click to create box' : `${getRecipesForMachine(machine.id).length} recipe(s)`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {selectorOpenedFrom === 'button' && <button onClick={() => { setSelectedProduct(null); setSelectedMachine(null); }} className="btn btn-secondary btn-back">← Back</button>}
                {selectedProduct && (
                  <div className="mb-lg">
                    <select value={recipeFilter} onChange={(e) => setRecipeFilter(e.target.value)} className="select">
                      <option value="all">All Recipes</option><option value="producers">Producers (Outputs {selectedProduct.name})</option>
                      <option value="consumers">Consumers (Uses {selectedProduct.name})</option>
                    </select>
                  </div>
                )}
                <div className="modal-content flex-col" style={{ maxHeight: '400px' }}>
                  {availableRecipes.length === 0 ? <div className="empty-state">No recipes found</div> : availableRecipes.map(recipe => {
                    const machine = getMachine(recipe.machine_id);
                    const isFavorite = favoriteRecipes.includes(recipe.id);
                    const machineCount = recipeMachineCounts[recipe.id] || 1;
                    return machine && recipe.inputs && recipe.outputs ? (
                      <div key={recipe.id} className="recipe-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button onClick={(e) => { e.stopPropagation(); toggleFavoriteRecipe(recipe.id); }}
                          style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px', lineHeight: 1,
                            filter: isFavorite ? 'none' : 'grayscale(100%)', opacity: isFavorite ? 1 : 0.4, transition: 'all 0.2s' }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.opacity = '1'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = isFavorite ? '1' : '0.4'; }}
                          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                          ⭐
                        </button>
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newNodeId = `node-${nodeId}`;
                            setKeepOverlayDuringTransition(true);
                            setShowRecipeSelector(false);
                            createRecipeBox(recipe);
                            setTimeout(() => {
                              setNewNodePendingMachineCount(newNodeId);
                              setEditingNodeId(newNodeId);
                              setEditingMachineCount('1');
                              setShowMachineCountEditor(true);
                              setKeepOverlayDuringTransition(false);
                            }, 50);
                          }}
                          style={{
                            minWidth: '70px',
                            padding: '10px 12px',
                            background: 'var(--color-primary)',
                            color: 'var(--color-primary-dark)',
                            borderRadius: 'var(--radius-sm)',
                            fontWeight: 700,
                            fontSize: '18px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            userSelect: 'none',
                            border: '2px solid transparent'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--color-primary-hover)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.borderColor = 'var(--color-primary-hover)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--color-primary)';
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.borderColor = 'transparent';
                          }}
                          title="Click to edit machine count"
                        >
                          {Number.isInteger(machineCount) ? machineCount : machineCount.toFixed(2)}
                        </div>
                        <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => createRecipeBox(recipe)}>
                          <div className="recipe-machine">{machine.name}</div>
                          <div className="recipe-details"><span className="recipe-label-input">Inputs: </span>
                            <span>{recipe.inputs.map(input => formatIngredient(input, getProduct)).join(', ')}</span></div>
                          <div className="recipe-details"><span className="recipe-label-output">Outputs: </span>
                            <span>{recipe.outputs.map(output => formatIngredient(output, getProduct)).join(', ')}</span></div>
                        </div>
                      </div>
                    ) : null;
                  })}
                </div>
              </>
            )}
            <button onClick={resetSelector} className="btn btn-secondary" style={{ marginTop: '20px' }}>Close</button>
          </div>
        </div>
      )}

      {showTargetsModal && (
        <div className="modal-overlay" onClick={() => setShowTargetsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Target Products</h2>
            <div className="modal-content flex-col" style={{ maxHeight: '500px', marginBottom: '20px' }}>
              {targetProducts.length === 0 ? (
                <div className="empty-state">No target products yet. Shift+Click a recipe box to mark it as a target.</div>
              ) : (
                targetProducts.map(target => (
                  <div key={target.id} className="target-card">
                    <div className="flex-1">
                      <div className="target-product-name">{getProductName(target.productId, getProduct)}</div>
                      <div className="target-box-id">Box ID: {target.recipeBoxId}</div>
                    </div>
                    <div className="target-input-group">
                      <label className="target-label">Target:</label>
                      <input type="number" min="0" value={target.desiredAmount} 
                        onChange={(e) => setTargetProducts(prev => prev.map(t => t.id === target.id ? { ...t, desiredAmount: parseFloat(e.target.value) || 0 } : t))} 
                        className="input input-small" />
                      <span className="target-label">/s</span>
                    </div>
                    <button onClick={() => setTargetProducts(prev => prev.filter(t => t.id !== target.id))} className="btn btn-delete">Remove</button>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setShowTargetsModal(false)} className="btn btn-secondary">Close</button>
          </div>
        </div>
      )}

      {showThemeEditor && <ThemeEditor onClose={() => setShowThemeEditor(false)} />}
    </div>
  );
}

export default App;