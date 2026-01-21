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
import { applyTemperaturesToNodes } from './utils/temperaturePropagation';
import { DEFAULT_DRILL_RECIPE, DEPTH_OUTPUTS, calculateDrillMetrics, buildDrillInputs, buildDrillOutputs } from './data/mineshaftDrill';
import { DEFAULT_LOGIC_ASSEMBLER_RECIPE, MICROCHIP_STAGES, calculateLogicAssemblerMetrics, buildLogicAssemblerInputs, buildLogicAssemblerOutputs } from './data/logicAssembler';
import { DEFAULT_TREE_FARM_RECIPE, calculateTreeFarmMetrics, buildTreeFarmInputs, buildTreeFarmOutputs } from './data/treeFarm';
import { FUEL_PRODUCTS, calculateFireboxMetrics, buildFireboxInputs, isIndustrialFireboxRecipe } from './data/industrialFirebox';
import { applyChemicalPlantSettings, DEFAULT_CHEMICAL_PLANT_SETTINGS } from './data/chemicalPlant';
import { DEFAULT_WASTE_FACILITY_RECIPE, calculateWasteFacilityMetrics, buildWasteFacilityInputs } from './data/undergroundWasteFacility';
import { DEFAULT_LIQUID_DUMP_RECIPE, calculateLiquidDumpPollution, buildLiquidDumpInputs } from './data/liquidDump';
import { DEFAULT_LIQUID_BURNER_RECIPE, calculateLiquidBurnerPollution, buildLiquidBurnerInputs } from './data/liquidBurner';
import { solveProductionNetwork, getExcessProducts, getDeficientProducts } from './solvers/productionSolver';
import { clearFlowCache } from './solvers/flowCalculator';
import { smartFormat, metricFormat, formatPowerDisplay, getRecipesUsingProduct, getRecipesProducingProductFiltered, 
  getRecipesForMachine, canDrillUseProduct, canLogicAssemblerUseProduct, canTreeFarmUseProduct, applyTemperatureToOutputs, 
  initializeRecipeTemperatures } from './utils/appUtilities';
import { configureSpecialRecipe, calculateMachineCountForAutoConnect, getSpecialRecipeInputs, getSpecialRecipeOutputs, isSpecialRecipe } from './utils/recipeBoxCreation';
import { propagateMachineCount, propagateFromHandle, calculateMachineCountForNewConnection } from './utils/machineCountPropagator';
import { buildProductionGraph } from './solvers/graphBuilder';
import { computeMachines } from './solvers/computeMachinesSolver';
  
const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

const TargetExcessInput = ({ productName, connectedFlow, currentExcess, onTargetExcessCommit, styleType }) => {
  const [localValue, setLocalValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const formatRate = (rate) => {
    if (typeof rate !== 'number') return '0';
    return rate.toFixed(4);
  };

  const displayValue = isEditing ? localValue : formatRate(currentExcess);

  const handleCommit = () => {
    if (!isEditing) return;
    
    const val = parseFloat(localValue);
    if (!isNaN(val)) {
      onTargetExcessCommit(val);
    }
    setIsEditing(false);
    setLocalValue('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleCommit();
    }
  };

  return (
    <div style={{
      marginBottom: '10px',
      padding: '8px',
      background: styleType === 'input' ? 'var(--input-bg)' : 'var(--output-bg)',
      border: `1px solid ${styleType === 'input' ? 'var(--input-border)' : 'var(--output-border)'}`,
      borderRadius: 'var(--radius-sm)'
    }}>
      <div style={{ 
        color: styleType === 'input' ? 'var(--input-text)' : 'var(--output-text)', 
        fontSize: '12px',
        marginBottom: '6px',
        fontWeight: 600
      }}>
        {productName}
      </div>
      
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
        Connected: {formatRate(connectedFlow)}/s
      </div>
      
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
        {styleType === 'output' ? 'Current Excess:' : 'Current Deficiency:'} {formatRate(Math.abs(currentExcess))}/s
      </div>
      
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        {styleType === 'output' ? 'Target Excess:' : 'Target Additional Demand:'}
      </div>
      
      <input
        type="text"
        value={displayValue}
        onFocus={() => {
          setIsEditing(true);
          setLocalValue(formatRate(currentExcess));
        }}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleCommit}
        onKeyPress={handleKeyPress}
        className="input"
        style={{
          padding: '6px',
          fontSize: '13px',
          width: '100%'
        }}
      />
      <div style={{
        color: 'var(--text-muted)',
        fontSize: '10px',
        marginTop: '4px',
        textAlign: 'right'
      }}>
        /s
      </div>
    </div>
  );
};

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
  const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
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
  const [edgeSettings, setEdgeSettings] = useState(() => {
    const theme = loadTheme();
    return {
      edgePath: theme.edgePath || 'orthogonal',
      edgeStyle: theme.edgeStyle || 'animated'
    };
  });
  const [extendedPanelClosing, setExtendedPanelClosing] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [globalPollution, setGlobalPollution] = useState(0);
  const [pollutionInputFocused, setPollutionInputFocused] = useState(false);
  const [isPollutionPaused, setIsPollutionPaused] = useState(true);
  const [soldProducts, setSoldProducts] = useState({});
  const [displayMode, setDisplayMode] = useState('perSecond');
  const [machineDisplayMode, setMachineDisplayMode] = useState('total');
  const [favoriteRecipes, setFavoriteRecipes] = useState([]);
  const [lastDrillConfig, setLastDrillConfig] = useState(null);
  const [lastAssemblerConfig, setLastAssemblerConfig] = useState(null);
  const [lastTreeFarmConfig, setLastTreeFarmConfig] = useState(null);
  const [lastFireboxConfig, setLastFireboxConfig] = useState(null);
  const [lastWasteFacilityConfig, setLastWasteFacilityConfig] = useState(null);
  const [recipeMachineCounts, setRecipeMachineCounts] = useState({});
  const [pendingNode, setPendingNode] = useState(null); // For middle-click duplication
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const reactFlowWrapper = useRef(null);
  const reactFlowInstance = useRef(null);
  const fileInputRef = useRef(null);

  const isForestTheme = () => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim().toLowerCase() === '#5fb573';
  const statisticsTitle = isForestTheme() ? "Plant Statistics" : "Plan Statistics";
  const dragTimeoutRef = useRef(null);
  const pendingChangesRef = useRef([]);

  const onNodesChange = useCallback((changes) => {
    // Batch all changes for better performance
    const positionChanges = [];
    const otherChanges = [];
    
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (change.type === 'position' && change.dragging) {
        positionChanges.push(change);
      } else {
        otherChanges.push(change);
      }
    }
    
    if (positionChanges.length > 0) {
      onNodesChangeBase(positionChanges);
    }
    
    if (otherChanges.length > 0) {
      pendingChangesRef.current.push(...otherChanges);
      
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
      
      dragTimeoutRef.current = setTimeout(() => {
        if (pendingChangesRef.current.length > 0) {
          onNodesChangeBase(pendingChangesRef.current);
          pendingChangesRef.current = [];
        }
      }, 50);
    }
  }, [onNodesChangeBase]);
  
  const onEdgesChange = useCallback((changes) => {
    onEdgesChangeBase(changes);
  }, [onEdgesChangeBase]);

  useEffect(() => { 
    const theme = loadTheme();
    applyTheme(theme);
    setEdgeSettings({
      edgePath: theme.edgePath || 'orthogonal',
      edgeStyle: theme.edgeStyle || 'animated'
    });
  }, []);

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
          onBoilerSettingsChange: handleBoilerSettingsChange, onChemicalPlantSettingsChange: handleChemicalPlantSettingsChange, 
          onMiddleClick: onNodeMiddleClick, onHandleDoubleClick: handleHandleDoubleClick, globalPollution,
          flows: null, suggestions: [] }};
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
      setLastWasteFacilityConfig(savedState.lastWasteFacilityConfig || null);
      setNodeId(savedState.nodeId || 0);
      setTargetIdCounter(savedState.targetIdCounter || 0);
    }
  }, []);

  useEffect(() => { 
    setNodes(nds => {
      const newNodes = new Array(nds.length);
      for (let i = 0; i < nds.length; i++) {
        const node = nds[i];
        newNodes[i] = {
          ...node,
          data: {
            ...node.data,
            displayMode,
            machineDisplayMode
          }
        };
      }
      return newNodes;
    });
  }, [displayMode, machineDisplayMode, setNodes]);

  // Update edges when edge settings change
  useEffect(() => {
    setEdges(eds => eds.map(edge => ({
      ...edge,
      data: edgeSettings
    })));
  }, [edgeSettings, setEdges]);
  useEffect(() => { 
    const stateToSave = { nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts, favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig, lastWasteFacilityConfig };
    localStorage.setItem('industrialist_canvas_state', JSON.stringify(stateToSave));
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts, favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig, lastWasteFacilityConfig]);

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
        const pollutionNum = typeof pollution === 'number' ? pollution : parseFloat(pollution);
        if (!isNaN(pollutionNum) && isFinite(pollutionNum)) totalPollution += pollutionNum * machineCount;
        const inputOutputCount = (recipe.inputs?.length || 0) + (recipe.outputs?.length || 0);
        // Industrial firebox has 0 power, so powerFactor = 0
        const powerFactor = 0;
        const inputOutputFactor = inputOutputCount * 2;
        const roundedMachineCount = Math.ceil(machineCount);
        totalModelCount += roundedMachineCount * (1 + powerFactor + inputOutputFactor);
        return;
      }
      
      // Special handling for tree farm - count all sub-machines
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
        
        // Model count = (Trees + Harvesters + Sprinklers + WaterTanks*3 + Controller + Outputs*3 + powerFactor) * machineCount
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
      // Calculate model count: machineCount * (1 + powerFactor + inputOutputFactor)
      const powerFactor = Math.ceil(powerValue / 1500000) * 2;
      const inputOutputFactor = inputOutputCount * 2;
      const roundedMachineCount = Math.ceil(machineCount);
      totalModelCount += roundedMachineCount * (1 + powerFactor + inputOutputFactor);
    });
    return { totalPower, totalPollution, totalModelCount };
  }, [nodes]);

  const stats = useMemo(() => calculateTotalStats(), [nodes]);
  
  useEffect(() => {
    // Don't even start the interval if paused or no pollution
    if (isPollutionPaused || stats.totalPollution === 0) {
      return; // No interval created, no memory churn
    }
    
    const interval = setInterval(() => {
      if (pollutionInputFocused) return;
      const pollutionPerSecond = stats.totalPollution / 3600;
      setGlobalPollution(prev => {
        if (typeof prev !== 'number' || isNaN(prev) || !isFinite(prev)) return prev;
        const newValue = parseFloat((prev + pollutionPerSecond).toFixed(4));
        // Only update if value actually changed
        return newValue !== prev ? newValue : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [stats.totalPollution, pollutionInputFocused, isPollutionPaused]);

  useEffect(() => {
    // Clear flow cache periodically
    const interval = setInterval(() => {
      clearFlowCache();
    }, 20000); // Every 20 seconds
    
    return () => clearInterval(interval);
  }, []);

  const pollutionUpdateTimeoutRef = useRef(null);

  const lastPollutionRef = useRef(globalPollution);

  useEffect(() => {
    // Skip if pollution hasn't changed significantly (within 0.01%)
    if (Math.abs(globalPollution - lastPollutionRef.current) < 0.01) {
      return;
    }
    
    lastPollutionRef.current = globalPollution;
    
    if (pollutionUpdateTimeoutRef.current) {
      clearTimeout(pollutionUpdateTimeoutRef.current);
    }
    
    pollutionUpdateTimeoutRef.current = setTimeout(() => {
      setNodes(nds => {
        const newNodes = new Array(nds.length);
        let hasChanges = false;
        
        for (let i = 0; i < nds.length; i++) {
          const node = nds[i];
          const recipe = node.data?.recipe;
          const machine = node.data?.machine;
          
          // Update tree farms
          if (recipe?.isTreeFarm && recipe.treeFarmSettings) {
            const settings = recipe.treeFarmSettings;
            const updatedOutputs = buildTreeFarmOutputs(settings.trees, settings.harvesters, globalPollution);
            const metrics = calculateTreeFarmMetrics(settings.trees, settings.harvesters, settings.sprinklers, settings.outputs, settings.controller, globalPollution);
            
            hasChanges = true;
            newNodes[i] = {
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
          else if (machine?.id === 'm_air_separation_unit') {
            const residueAmount = calculateResidueAmount(globalPollution);
            const updatedOutputs = new Array(recipe.outputs.length);
            
            for (let j = 0; j < recipe.outputs.length; j++) {
              const output = recipe.outputs[j];
              if (output.product_id === 'p_residue') {
                updatedOutputs[j] = { ...output, quantity: parseFloat(residueAmount.toFixed(6)) };
              } else {
                updatedOutputs[j] = output;
              }
            }
            
            hasChanges = true;
            newNodes[i] = {
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
          // Only update globalPollution reference for other nodes
          else if (node.data.globalPollution !== globalPollution) {
            hasChanges = true;
            newNodes[i] = {
              ...node,
              data: {
                ...node.data,
                globalPollution
              }
            };
          } else {
            newNodes[i] = node;
          }
        }
        
        return hasChanges ? newNodes : nds;
      });
    }, 250);
    
    return () => {
      if (pollutionUpdateTimeoutRef.current) {
        clearTimeout(pollutionUpdateTimeoutRef.current);
      }
    };
  }, [globalPollution, setNodes]);

  const [productionSolution, setProductionSolution] = useState(() => 
    solveProductionNetwork([], [], { skipTemperature: true })
  );
  const solverTimeoutRef = useRef(null);
  const lastSolverHash = useRef('');
  const shouldRecalculate = useRef(false);
  const recalculationReasonRef = useRef(null);

  // Helper to trigger recalculation with reason tracking
  const triggerRecalculation = useCallback((reason = 'general') => {
    recalculationReasonRef.current = reason;
    shouldRecalculate.current = true;
  }, []);

  useEffect(() => {
    // Only recalculate when explicitly triggered
    if (!shouldRecalculate.current) return;
    
    if (solverTimeoutRef.current) {
      clearTimeout(solverTimeoutRef.current);
    }
    
    solverTimeoutRef.current = setTimeout(() => {
      // Create a hash including recipe settings for change detection
      const currentHash = `${nodes.length}-${edges.length}-${nodes.map(n => 
        `${n.id}:${n.data?.machineCount}:${JSON.stringify(n.data?.recipe?.temperatureSettings || {})}:${JSON.stringify(n.data?.recipe?.drillSettings || {})}:${JSON.stringify(n.data?.recipe?.assemblerSettings || {})}:${JSON.stringify(n.data?.recipe?.treeFarmSettings || {})}:${JSON.stringify(n.data?.recipe?.fireboxSettings || {})}:${JSON.stringify(n.data?.recipe?.chemicalPlantSettings || {})}`
      ).join(',')}`;
      
      // Only recalculate if structure actually changed
      if (currentHash !== lastSolverHash.current) {
        const reason = recalculationReasonRef.current || 'general';
        
        // Determine if temperature propagation is needed based on reason
        const needsTemperature = reason === 'connection' || 
                                reason === 'node' || 
                                reason === 'temperatureSettings' ||
                                reason === 'boilerSettings';
        
        console.log(`[Recalculation] Reason: ${reason}, Temperature propagation: ${needsTemperature}`);
        
        const solution = solveProductionNetwork(nodes, edges, { 
          skipTemperature: !needsTemperature,
          previousTemperatureData: needsTemperature ? null : productionSolution?.temperatureData
        });
        setProductionSolution(solution);
        lastSolverHash.current = currentHash;
      }
      
      shouldRecalculate.current = false;
      recalculationReasonRef.current = null;
    }, 100);
    
    return () => {
      if (solverTimeoutRef.current) {
        clearTimeout(solverTimeoutRef.current);
      }
    };
  }, [nodes, edges, productionSolution]);
  const excessProductsRaw = useMemo(() => getExcessProducts(productionSolution), [productionSolution]);
  const deficientProducts = useMemo(() => getDeficientProducts(productionSolution), [productionSolution]);

  const flowUpdateTimeoutRef = useRef(null);
  const lastFlowsRef = useRef(null);

  useEffect(() => {
    if (productionSolution?.flows?.byNode) {
      // Skip if flows haven't changed (reference equality)
      if (lastFlowsRef.current === productionSolution.flows) {
        return;
      }
      
      lastFlowsRef.current = productionSolution.flows;
      
      if (flowUpdateTimeoutRef.current) {
        clearTimeout(flowUpdateTimeoutRef.current);
      }
      
      flowUpdateTimeoutRef.current = setTimeout(() => {
        setNodes(nds => {
          const newNodes = new Array(nds.length);
          
          // Apply temperature data if available
          if (productionSolution.temperatureData) {
            const nodesWithTemp = applyTemperaturesToNodes(nds, productionSolution.temperatureData, productionSolution.graph);
            
            for (let i = 0; i < nodesWithTemp.length; i++) {
              const node = nodesWithTemp[i];
              const recipe = node.data?.recipe;
              
              // Update waste facility cycle times based on flows
              if (recipe?.isWasteFacility) {
                const flows = productionSolution.flows.byNode[node.id];
                const itemFlow = Math.min(flows?.inputFlows[0]?.connected || 0, 240);
                const fluidFlow = Math.min(flows?.inputFlows[1]?.connected || 0, 240);
                
                const settings = recipe.wasteFacilitySettings || {};
                const metrics = calculateWasteFacilityMetrics(itemFlow, fluidFlow);
                
                // Rebuild inputs with updated quantities
                const updatedInputs = buildWasteFacilityInputs(
                  itemFlow,
                  fluidFlow,
                  recipe.inputs[0].product_id,
                  recipe.inputs[1].product_id
                );
                
                newNodes[i] = {
                  ...node,
                  data: {
                    ...node.data,
                    recipe: {
                      ...recipe,
                      inputs: updatedInputs,
                      cycle_time: metrics.cycleTime,
                      wasteFacilitySettings: {
                        ...settings,
                        itemFlowRate: itemFlow,
                        fluidFlowRate: fluidFlow
                      }
                    },
                    flows: productionSolution.flows.byNode[node.id] || null,
                    suggestions: productionSolution.suggestions || []
                  }
                };
              }
              // Update liquid dump pollution based on actual flow rates (per machine)
              else if (recipe?.isLiquidDump) {
                const flows = productionSolution.flows.byNode[node.id];
                const machineCount = node.data?.machineCount || 1;
                
                // Calculate flow per machine (divide total flow by machine count)
                const flowRatesPerMachine = recipe.inputs.map((input, idx) => {
                  const totalFlow = Math.min(flows?.inputFlows[idx]?.connected || 0, 15 * machineCount);
                  return totalFlow / machineCount;
                });
                
                const pollution = calculateLiquidDumpPollution(recipe.inputs, flowRatesPerMachine);
                
                newNodes[i] = {
                  ...node,
                  data: {
                    ...node.data,
                    recipe: {
                      ...recipe,
                      pollution
                    },
                    flows: productionSolution.flows.byNode[node.id] || null,
                    suggestions: productionSolution.suggestions || []
                  }
                };
              }
              // Update liquid burner pollution based on actual flow rates (per machine)
              else if (recipe?.isLiquidBurner) {
                const flows = productionSolution.flows.byNode[node.id];
                const machineCount = node.data?.machineCount || 1;
                
                // Calculate flow per machine (divide total flow by machine count)
                const flowRatesPerMachine = recipe.inputs.map((input, idx) => {
                  const totalFlow = Math.min(flows?.inputFlows[idx]?.connected || 0, 15 * machineCount);
                  return totalFlow / machineCount;
                });
                
                const pollution = calculateLiquidBurnerPollution(recipe.inputs, flowRatesPerMachine);
                
                newNodes[i] = {
                  ...node,
                  data: {
                    ...node.data,
                    recipe: {
                      ...recipe,
                      pollution
                    },
                    flows: productionSolution.flows.byNode[node.id] || null,
                    suggestions: productionSolution.suggestions || []
                  }
                };
              } else {
                newNodes[i] = {
                  ...node,
                  data: {
                    ...node.data,
                    flows: productionSolution.flows.byNode[node.id] || null,
                    suggestions: productionSolution.suggestions || []
                  }
                };
              }
            }
          } else {
            for (let i = 0; i < nds.length; i++) {
              const node = nds[i];
              const recipe = node.data?.recipe;
              
              // Update waste facility cycle times based on flows
              if (recipe?.isWasteFacility) {
                const flows = productionSolution.flows.byNode[node.id];
                const itemFlow = Math.min(flows?.inputFlows[0]?.connected || 0, 240);
                const fluidFlow = Math.min(flows?.inputFlows[1]?.connected || 0, 240);
                
                const settings = recipe.wasteFacilitySettings || {};
                const metrics = calculateWasteFacilityMetrics(itemFlow, fluidFlow);
                
                // Rebuild inputs with updated quantities
                const updatedInputs = buildWasteFacilityInputs(
                  itemFlow,
                  fluidFlow,
                  recipe.inputs[0].product_id,
                  recipe.inputs[1].product_id
                );
                
                newNodes[i] = {
                  ...node,
                  data: {
                    ...node.data,
                    recipe: {
                      ...recipe,
                      inputs: updatedInputs,
                      cycle_time: metrics.cycleTime,
                      wasteFacilitySettings: {
                        ...settings,
                        itemFlowRate: itemFlow,
                        fluidFlowRate: fluidFlow
                      }
                    },
                    flows: productionSolution.flows.byNode[node.id] || null,
                    suggestions: productionSolution.suggestions || []
                  }
                };
              }
              // Update liquid dump pollution based on actual flow rates (per machine)
              else if (recipe?.isLiquidDump) {
                const flows = productionSolution.flows.byNode[node.id];
                const machineCount = node.data?.machineCount || 1;
                
                // Calculate flow per machine (divide total flow by machine count)
                const flowRatesPerMachine = recipe.inputs.map((input, idx) => {
                  const totalFlow = Math.min(flows?.inputFlows[idx]?.connected || 0, 15 * machineCount);
                  return totalFlow / machineCount;
                });
                
                const pollution = calculateLiquidDumpPollution(recipe.inputs, flowRatesPerMachine);
                
                newNodes[i] = {
                  ...node,
                  data: {
                    ...node.data,
                    recipe: {
                      ...recipe,
                      pollution
                    },
                    flows: productionSolution.flows.byNode[node.id] || null,
                    suggestions: productionSolution.suggestions || []
                  }
                };
              }
              // Update liquid burner pollution based on actual flow rates (per machine)
              else if (recipe?.isLiquidBurner) {
                const flows = productionSolution.flows.byNode[node.id];
                const machineCount = node.data?.machineCount || 1;
                
                // Calculate flow per machine (divide total flow by machine count)
                const flowRatesPerMachine = recipe.inputs.map((input, idx) => {
                  const totalFlow = Math.min(flows?.inputFlows[idx]?.connected || 0, 15 * machineCount);
                  return totalFlow / machineCount;
                });
                
                const pollution = calculateLiquidBurnerPollution(recipe.inputs, flowRatesPerMachine);
                
                newNodes[i] = {
                  ...node,
                  data: {
                    ...node.data,
                    recipe: {
                      ...recipe,
                      pollution
                    },
                    flows: productionSolution.flows.byNode[node.id] || null,
                    suggestions: productionSolution.suggestions || []
                  }
                };
              } else {
                newNodes[i] = {
                  ...node,
                  data: {
                    ...node.data,
                    flows: productionSolution.flows.byNode[node.id] || null,
                    suggestions: productionSolution.suggestions || []
                  }
                };
              }
            }
          }
          
          return newNodes;
        }); 
      }, 250);
    }
    
    return () => {
      if (flowUpdateTimeoutRef.current) {
        clearTimeout(flowUpdateTimeoutRef.current);
      }
    };
  }, [productionSolution, setNodes]);
  
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
    const lastConfigs = { drillConfig: lastDrillConfig, assemblerConfig: lastAssemblerConfig, treeFarmConfig: lastTreeFarmConfig, fireboxConfig: lastFireboxConfig };
    const flows = productionSolution?.flows || null;
    return calculateMachineCountForAutoConnect(recipe, targetNode, autoConnect, findBestDepthForProduct, lastConfigs, globalPollution, flows);
  }, [lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig, findBestDepthForProduct, globalPollution, productionSolution]);

  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    if (!sourceNode || !targetNode) return;
    
    const sourceOutput = sourceNode.data.recipe.outputs[parseInt(params.sourceHandle.split('-')[1])];
    const targetInput = targetNode.data.recipe.inputs[parseInt(params.targetHandle.split('-')[1])];
    
    if (!sourceOutput || !targetInput) return;
    
    const sourceProductId = sourceOutput.product_id;
    const targetProductId = targetInput.product_id;
    
    // Handle any product inputs - validate type matching
    if (targetInput.isAnyProduct) {
      const sourceProduct = getProduct(sourceProductId);
      const acceptedType = targetInput.acceptedType;
      
      if (acceptedType && sourceProduct?.type !== acceptedType) {
        // Type mismatch - cannot connect
        return;
      }
      
      // Update target input to use the actual product
      setNodes(nds => nds.map(n => {
        if (n.id === targetNode.id) {
          const updatedInputs = [...n.data.recipe.inputs];
          const inputIndex = parseInt(params.targetHandle.split('-')[1]);
          updatedInputs[inputIndex] = {
            ...updatedInputs[inputIndex],
            product_id: sourceProductId,
            isAnyProduct: false
          };
          
          // For waste facility, recalculate requirements
          if (n.data.recipe.isWasteFacility) {
            const settings = n.data.recipe.wasteFacilitySettings || {};
            const flows = productionSolution?.flows?.byNode[params.source];
            const sourceOutputIndex = parseInt(params.sourceHandle.split('-')[1]);
            const sourceOutputFlow = flows?.outputFlows[sourceOutputIndex];
            const availableFlow = sourceOutputFlow ? (sourceOutputFlow.produced - sourceOutputFlow.connected) : 0;
            
            // Cap at 240/s max per input
            const cappedFlow = Math.min(availableFlow, 240);
            
            const inputIndex = parseInt(params.targetHandle.split('-')[1]);
            if (inputIndex === 0) {
              // Item input
              settings.itemFlowRate = cappedFlow;
            } else if (inputIndex === 1) {
              // Fluid input
              settings.fluidFlowRate = cappedFlow;
            }
            
            const metrics = calculateWasteFacilityMetrics(
              settings.itemFlowRate || 0,
              settings.fluidFlowRate || 0
            );
            
            const allInputs = buildWasteFacilityInputs(
              settings.itemFlowRate || 0,
              settings.fluidFlowRate || 0,
              inputIndex === 0 ? sourceProductId : updatedInputs[0].product_id,
              inputIndex === 1 ? sourceProductId : updatedInputs[1].product_id
            );
            
            return {
              ...n,
              data: {
                ...n.data,
                recipe: {
                  ...n.data.recipe,
                  inputs: allInputs,
                  cycle_time: metrics.cycleTime,
                  wasteFacilitySettings: settings
                }
              }
            };
          }
          
          // For liquid dump/burner, recalculate pollution
          if (n.data.recipe.isLiquidDump || n.data.recipe.isLiquidBurner) {
            const pollution = n.data.recipe.isLiquidDump 
              ? calculateLiquidDumpPollution(updatedInputs)
              : calculateLiquidBurnerPollution(updatedInputs);
            
            return {
              ...n,
              data: {
                ...n.data,
                recipe: {
                  ...n.data.recipe,
                  inputs: updatedInputs,
                  pollution
                }
              }
            };
          }
          
          return {
            ...n,
            data: {
              ...n.data,
              recipe: {
                ...n.data.recipe,
                inputs: updatedInputs
              }
            }
          };
        }
        return n;
      }));
    } else if (sourceProductId !== targetProductId) {
      return;
    }
    
    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false, data: edgeSettings }, eds));
    clearFlowCache();
    triggerRecalculation('connection');
  }, [setEdges, nodes, edgeSettings, triggerRecalculation, setNodes, productionSolution]);

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
      clearFlowCache();
      triggerRecalculation('connection');
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
      clearFlowCache();
      triggerRecalculation('connection');
      return;
    }
    
    // Check if source node is a heat source - use ref to get current nodes
    const sourceNode = nodesRef.current.find(n => n.id === nodeId);
    const machineId = sourceNode?.data?.recipe?.machine_id;
    const isHeatSource = machineId && HEAT_SOURCES[machineId];
    
    const product = getProduct(productId);
    if (product) { 
      setShowRecipeSelector(true); 
      setSelectedProduct(product); 
      setAutoConnectTarget({ 
        nodeId, 
        outputIndex, 
        productId, 
        isOutput: true,
        isFromHeatSource: !!isHeatSource 
      }); 
      setSelectorOpenedFrom('rectangle'); 
      setRecipeFilter('consumers'); 
    }
  }, [setEdges]);


  const cleanupInvalidConnections = useCallback((nodeId, inputs, outputs) => {
    setEdges((eds) => {
      const filteredEdges = eds.filter(edge => {
        if (edge.source === nodeId) {
          const handleIndex = parseInt(edge.sourceHandle.split('-')[1]);
          if (handleIndex >= outputs.length) return false;
          
          // Check if product still matches
          const output = outputs[handleIndex];
          const targetNode = nodes.find(n => n.id === edge.target);
          if (!targetNode) return false;
          
          const targetInputIndex = parseInt(edge.targetHandle.split('-')[1]);
          const targetInput = targetNode.data?.recipe?.inputs[targetInputIndex];
          if (!targetInput || targetInput.product_id !== output.product_id) return false;
        }
        
        if (edge.target === nodeId) {
          const handleIndex = parseInt(edge.targetHandle.split('-')[1]);
          if (handleIndex >= inputs.length) return false;
          
          // Check if product still matches
          const input = inputs[handleIndex];
          const sourceNode = nodes.find(n => n.id === edge.source);
          if (!sourceNode) return false;
          
          const sourceOutputIndex = parseInt(edge.sourceHandle.split('-')[1]);
          const sourceOutput = sourceNode.data?.recipe?.outputs[sourceOutputIndex];
          if (!sourceOutput || sourceOutput.product_id !== input.product_id) return false;
        }
        
        return true;
      });
      
      if (filteredEdges.length !== eds.length) {
        clearFlowCache();
        triggerRecalculation('connection');
      }
      
      return filteredEdges;
    });
  }, [setEdges, nodes, triggerRecalculation]);

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
    cleanupInvalidConnections(nodeId, inputs, outputs);
    triggerRecalculation('settings');
  }, [cleanupInvalidConnections, triggerRecalculation]);

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
    cleanupInvalidConnections(nodeId, inputs, outputs);
    triggerRecalculation('settings');
  }, [cleanupInvalidConnections, triggerRecalculation]);

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
    triggerRecalculation('settings');
  }, [setEdges, globalPollution, triggerRecalculation]);

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
    triggerRecalculation('settings');
  }, [triggerRecalculation]);

  const handleTemperatureSettingsChange = useCallback((nodeId, settings, outputs, powerConsumption) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      
      const machine = getMachine(n.data.recipe.machine_id);
      const isTempDependent = hasTempDependentCycle(machine?.id);
      let updatedRecipe = { 
        ...n.data.recipe, 
        outputs, 
        temperatureSettings: settings, 
        power_consumption: powerConsumption !== null && powerConsumption !== undefined ? powerConsumption : n.data.recipe.power_consumption 
      };
      
      // Special handling for Water Treatment Plant
      if (machine?.id === 'm_water_treatment_plant' && isTempDependent) {
        const inputTemp = settings.temperature || DEFAULT_STEAM_TEMPERATURE;
        const cycleTime = getTempDependentCycleTime(machine.id, inputTemp, 1);
        
        // Steam is always 90/s, so quantity = 90 * cycleTime
        const steamQuantity = 90 * cycleTime;
        
        // Water/distilled inputs scale with cycle time
        const baseWaterQuantity = 17.6;
        const baseDistilledQuantity = 17.6;
        
        updatedRecipe = {
          ...updatedRecipe,
          inputs: updatedRecipe.inputs.map(input => {
            if (input.product_id === 'p_water') {
              return { ...input, quantity: baseWaterQuantity * cycleTime, originalQuantity: baseWaterQuantity };
            }
            if (input.product_id === 'p_distilled_water') {
              return { ...input, quantity: baseDistilledQuantity * cycleTime, originalQuantity: baseDistilledQuantity };
            }
            return input;
          }),
          outputs: updatedRecipe.outputs.map(output => {
            if (output.product_id === 'p_steam') {
              return { ...output, quantity: steamQuantity, originalQuantity: 90 };
            }
            return output;
          })
        };
      }
      
      return { ...n, data: { ...n.data, recipe: updatedRecipe } };
    }));
    triggerRecalculation('temperatureSettings');
  }, [setNodes, triggerRecalculation]);

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
    triggerRecalculation('boilerSettings');
  }, [setNodes, triggerRecalculation]);

  const handleHandleDoubleClick = useCallback((nodeId, side, index, productId, suggestions) => {
    // Check if there's a suggestion for this handle
    const handleType = side === 'right' ? 'output' : 'input';
    const suggestion = suggestions?.find(s => 
      s.nodeId === nodeId && 
      s.handleType === handleType && 
      s.handleIndex === index
    );
    
    if (!suggestion) {
      return;
    }
    
    const newMachineCount = suggestion.suggestedMachineCount;
    
    // Just set the suggested count on this node only (no propagation)
    setNodes(nds => nds.map(n => 
      n.id === nodeId
        ? { ...n, data: { ...n.data, machineCount: newMachineCount } }
        : n
    ));
    
    triggerRecalculation('machineCount');
  }, [setNodes, triggerRecalculation]);

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
    triggerRecalculation('settings');
  }, [setNodes, triggerRecalculation]);

  const handleWasteFacilitySettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    setLastWasteFacilityConfig({
      itemProductId: settings.itemProductId,
      fluidProductId: settings.fluidProductId
    });
    
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      
      // Get current flow rates from existing settings
      const currentSettings = n.data.recipe.wasteFacilitySettings || {};
      const itemFlowRate = currentSettings.itemFlowRate || 0;
      const fluidFlowRate = currentSettings.fluidFlowRate || 0;
      
      // Calculate metrics with current flow rates
      const metrics = calculateWasteFacilityMetrics(itemFlowRate, fluidFlowRate);
      
      return {
        ...n,
        data: {
          ...n.data,
          recipe: {
            ...n.data.recipe,
            inputs: inputs.length > 0 ? inputs : n.data.recipe.inputs,
            wasteFacilitySettings: { ...settings, itemFlowRate, fluidFlowRate },
            cycle_time: metrics.cycleTime
          },
          leftHandles: Math.max(inputs.length, 1)
        }
      };
    }));
    cleanupInvalidConnections(nodeId, inputs, outputs);
    triggerRecalculation('settings');
  }, [cleanupInvalidConnections, triggerRecalculation, setNodes]);

  const handleLiquidDumpSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      
      return {
        ...n,
        data: {
          ...n.data,
          recipe: {
            ...n.data.recipe,
            inputs: inputs.length > 0 ? inputs : n.data.recipe.inputs,
            liquidDumpSettings: settings,
            pollution: calculateLiquidDumpPollution(inputs)
          },
          leftHandles: Math.max(inputs.length, 1)
        }
      };
    }));
    cleanupInvalidConnections(nodeId, inputs, outputs);
    triggerRecalculation('settings');
  }, [cleanupInvalidConnections, triggerRecalculation, setNodes]);

  const handleLiquidBurnerSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      
      return {
        ...n,
        data: {
          ...n.data,
          recipe: {
            ...n.data.recipe,
            inputs: inputs.length > 0 ? inputs : n.data.recipe.inputs,
            liquidBurnerSettings: settings,
            pollution: calculateLiquidBurnerPollution(inputs)
          },
          leftHandles: Math.max(inputs.length, 1)
        }
      };
    }));
    cleanupInvalidConnections(nodeId, inputs, outputs);
    triggerRecalculation('settings');
  }, [cleanupInvalidConnections, triggerRecalculation, setNodes]);

  const createRecipeBox = useCallback((recipe, overrideMachineCount = null) => {
    
    const machine = getMachine(recipe.machine_id);
    if (!machine || !recipe.inputs || !recipe.outputs) { 
      alert('Error: Invalid machine or recipe data'); 
      return; 
    }
    
    let recipeWithTemp = initializeRecipeTemperatures(recipe, machine.id);
    const newNodeId = `node-${nodeId}`;
    const targetNode = autoConnectTarget ? nodes.find(n => n.id === autoConnectTarget.nodeId) : null;
    
    let position;
    if (targetNode) {
      // Position relative to target node for auto-connect
      position = { 
        x: targetNode.position.x + (autoConnectTarget.isOutput ? 400 : -400), 
        y: targetNode.position.y 
      };
    } else {
      // Place at center of screen viewport
      if (reactFlowInstance.current && reactFlowWrapper.current) {
        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        const centerX = bounds.width / 2;
        const centerY = bounds.height / 2;
        
        // Convert screen center to flow coordinates
        const flowPosition = reactFlowInstance.current.screenToFlowPosition({
          x: bounds.left + centerX,
          y: bounds.top + centerY,
        });
        
        // Check if there's already a node near this position
        const nodeWidth = 320;
        const nodeHeight = 300;
        const spacing = 50;
        
        let finalPosition = { x: flowPosition.x - nodeWidth / 2, y: flowPosition.y - nodeHeight / 2 };
        
        // Find a clear spot near the center if occupied
        let attempts = 0;
        const maxAttempts = 20;
        while (attempts < maxAttempts) {
          const hasOverlap = nodes.some(node => {
            const dx = Math.abs(node.position.x - finalPosition.x);
            const dy = Math.abs(node.position.y - finalPosition.y);
            return dx < nodeWidth + spacing && dy < nodeHeight + spacing;
          });
          
          if (!hasOverlap) break;
          
          // Try positions in a spiral pattern around center
          const angle = (attempts / maxAttempts) * Math.PI * 2;
          const distance = 100 + (attempts * 50);
          finalPosition = {
            x: flowPosition.x - nodeWidth / 2 + Math.cos(angle) * distance,
            y: flowPosition.y - nodeHeight / 2 + Math.sin(angle) * distance
          };
          attempts++;
        }
        
        position = finalPosition;
      } else {
        // Fallback to random position if ReactFlow instance not ready
        position = { 
          x: Math.random() * 400 + 100, 
          y: Math.random() * 300 + 100 
        };
      }
    }
    
    const isBoiler = HEAT_SOURCES[machine.id]?.type === 'boiler';
    
    // For boilers, temporarily use hot temperature for machine count calculations
    if (isBoiler) {
      const settingsWithCoolant = {
        heatLoss: recipeWithTemp.temperatureSettings?.heatLoss ?? 0,
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
    
    // Configure special recipes
    const lastConfigs = { 
      drillConfig: lastDrillConfig, 
      assemblerConfig: lastAssemblerConfig, 
      treeFarmConfig: lastTreeFarmConfig, 
      fireboxConfig: lastFireboxConfig 
    };
    
    if (isSpecialRecipe(recipeWithTemp)) {
      recipeWithTemp = configureSpecialRecipe(
        recipeWithTemp, 
        autoConnectTarget, 
        selectedProduct, 
        lastConfigs, 
        globalPollution, 
        findBestDepthForProduct
      );
      
      // Update last configs based on the configured recipe
      if (recipeWithTemp.drillSettings) {
        setLastDrillConfig({
          drillHead: recipeWithTemp.drillSettings.drillHead,
          consumable: recipeWithTemp.drillSettings.consumable,
          machineOil: recipeWithTemp.drillSettings.machineOil
        });
      }
      
      if (recipeWithTemp.assemblerSettings) {
        setLastAssemblerConfig({
          outerStage: recipeWithTemp.assemblerSettings.outerStage,
          innerStage: recipeWithTemp.assemblerSettings.innerStage,
          machineOil: recipeWithTemp.assemblerSettings.machineOil,
          tickCircuitDelay: recipeWithTemp.assemblerSettings.tickCircuitDelay
        });
      }
      
      if (recipeWithTemp.treeFarmSettings) {
        setLastTreeFarmConfig({
          trees: recipeWithTemp.treeFarmSettings.trees,
          harvesters: recipeWithTemp.treeFarmSettings.harvesters,
          sprinklers: recipeWithTemp.treeFarmSettings.sprinklers,
          outputs: recipeWithTemp.treeFarmSettings.outputs
        });
      }
      
      if (recipeWithTemp.fireboxSettings) {
        setLastFireboxConfig({
          fuel: recipeWithTemp.fireboxSettings.fuel
        });
      }
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
    
    // Use override machine count if provided, otherwise use calculated
  const calculatedMachineCount = overrideMachineCount !== null ? overrideMachineCount : (recipeMachineCounts[recipe.id] ?? 1);
    
    const newNode = { 
      id: newNodeId, 
      type: 'custom', 
      position, 
      data: { 
        recipe: recipeWithTemp, 
        machine, 
        machineCount: calculatedMachineCount, 
        displayMode, 
        machineDisplayMode,
        leftHandles: Math.max(recipeWithTemp.inputs.length, 1), 
        rightHandles: Math.max(recipeWithTemp.outputs.length, 1),
        onInputClick: openRecipeSelectorForInput, 
        onOutputClick: openRecipeSelectorForOutput,
        onDrillSettingsChange: handleDrillSettingsChange, 
        onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange, 
        onTreeFarmSettingsChange: handleTreeFarmSettingsChange,
        onIndustrialFireboxSettingsChange: handleIndustrialFireboxSettingsChange, 
        onTemperatureSettingsChange: handleTemperatureSettingsChange, 
        onBoilerSettingsChange: handleBoilerSettingsChange, 
        onChemicalPlantSettingsChange: handleChemicalPlantSettingsChange, 
        onWasteFacilitySettingsChange: handleWasteFacilitySettingsChange,
        onLiquidDumpSettingsChange: handleLiquidDumpSettingsChange,
        onLiquidBurnerSettingsChange: handleLiquidBurnerSettingsChange,
        onMiddleClick: onNodeMiddleClick,
        onHandleDoubleClick: handleHandleDoubleClick,
        globalPollution, 
        isTarget: false, 
        flows: null,
        suggestions: []
      }, 
      sourcePosition: 'right', 
      targetPosition: 'left' 
    };
    
    setNodes((nds) => {
      const updatedNodes = [...nds, newNode];
      triggerRecalculation('node');
      if (autoConnectTarget && calculatedMachineCount > 0) {
        setTimeout(() => {
          const searchKey = autoConnectTarget.isOutput ? 'inputs' : 'outputs';
          let index = -1;
          
          // Special handling for waste facility concrete/lead inputs
          if ((recipeWithTemp.isWasteFacility || recipeWithTemp.id === 'r_underground_waste_facility') && !autoConnectTarget.isOutput) {
            if (autoConnectTarget.productId === 'p_concrete_block') {
              index = 2; // 3rd input
            } else if (autoConnectTarget.productId === 'p_lead_ingot') {
              index = 3; // 4th input
            } else {
              index = recipeWithTemp[searchKey].findIndex(item => item.product_id === autoConnectTarget.productId);
            }
          }
          // Special handling for heat sources connecting to boilers
          else if (autoConnectTarget.isOutput && autoConnectTarget.isFromHeatSource) {
            // Check if the NEW recipe being created is a boiler
            const newMachine = getMachine(recipeWithTemp.machine_id);
            const isBoiler = newMachine && HEAT_SOURCES[newMachine.id]?.type === 'boiler';
            
            if (isBoiler && recipeWithTemp.inputs.length >= 2) {
              const firstInput = recipeWithTemp.inputs[0]?.product_id;
              const secondInput = recipeWithTemp.inputs[1]?.product_id;
              
              // If both inputs are the same product AND match the source product, prefer second input
              if (firstInput === secondInput && secondInput === autoConnectTarget.productId) {
                index = 1; // Connect to coolant input
              } 
              // If only second input matches, connect to it
              else if (secondInput === autoConnectTarget.productId) {
                index = 1;
              }
              // Otherwise find first matching input
              else {
                index = recipeWithTemp[searchKey].findIndex(item => item.product_id === autoConnectTarget.productId);
              }
            } else {
              // Normal connection for non-boilers
              index = recipeWithTemp[searchKey].findIndex(item => item.product_id === autoConnectTarget.productId);
            }
          } else {
            index = recipeWithTemp[searchKey].findIndex(item => item.product_id === autoConnectTarget.productId);
          }
          
          if (index !== -1) {
            const sourceHandleIndex = autoConnectTarget.isOutput ? autoConnectTarget.outputIndex : index;
            const targetHandleIndex = autoConnectTarget.isOutput ? index : autoConnectTarget.inputIndex;
            const newEdge = { 
              source: autoConnectTarget.isOutput ? autoConnectTarget.nodeId : newNodeId, 
              sourceHandle: `right-${sourceHandleIndex}`,
              target: autoConnectTarget.isOutput ? newNodeId : autoConnectTarget.nodeId, 
              targetHandle: `left-${targetHandleIndex}`, 
              type: 'custom', 
              animated: false,
              data: edgeSettings
            };
            setEdges((eds) => addEdge(newEdge, eds));
            clearFlowCache();
            triggerRecalculation('connection');
          }
        }, 50);
      }
      return updatedNodes;
    });
    
    setNodeId((id) => id + 1);
    triggerRecalculation();
    
    // Return the new node ID for machine count editor flow
    return newNodeId;
  }, [nodeId, nodes, setNodes, setEdges, openRecipeSelectorForInput, openRecipeSelectorForOutput, handleDrillSettingsChange,
    handleLogicAssemblerSettingsChange, handleTreeFarmSettingsChange, handleIndustrialFireboxSettingsChange, 
    handleTemperatureSettingsChange, handleBoilerSettingsChange, handleChemicalPlantSettingsChange, autoConnectTarget, displayMode, 
    machineDisplayMode, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig, findBestDepthForProduct, 
    recipeMachineCounts, globalPollution, selectedProduct, triggerRecalculation]);

  const deleteRecipeBoxAndTarget = useCallback((boxId) => {
    setNodes((nds) => nds.filter((n) => n.id !== boxId)); setEdges((eds) => eds.filter((e) => e.source !== boxId && e.target !== boxId));
    setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== boxId));
    clearFlowCache();
    triggerRecalculation('node');
  }, [setNodes, setEdges, triggerRecalculation]);

  const toggleTargetStatus = useCallback((node) => {
    const existingTarget = targetProducts.find(t => t.recipeBoxId === node.id);
    if (existingTarget) { 
      setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== node.id)); 
      updateNodeData(node.id, data => ({ ...data, isTarget: false })); 
    }
    else if (node.data?.recipe) {
      setTargetProducts(prev => [...prev, { 
        id: `target_${targetIdCounter}`, 
        recipeBoxId: node.id
      }]);
      setTargetIdCounter(prev => prev + 1); 
      updateNodeData(node.id, data => ({ ...data, isTarget: true }));
    }
  }, [targetProducts, targetIdCounter]);

  const handleUpdateTarget = useCallback((targetId, ioType, ioIndex, targetExcess) => {
    const target = targetProducts.find(t => t.id === targetId);
    if (!target) return;

    const node = nodes.find(n => n.id === target.recipeBoxId);
    if (!node) return;

    const recipe = node.data?.recipe;
    const machine = node.data?.machine;
    if (!recipe) return;

    const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';

    // Calculate cycle time (same logic as in the modal)
    let cycleTime = recipe.cycle_time;
    if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
    
    // Apply temperature-dependent cycle time if applicable
    const isTempDependent = hasTempDependentCycle(machine?.id);
    if (isTempDependent) {
      const tempInfo = TEMP_DEPENDENT_MACHINES[machine.id];
      if (tempInfo?.type === 'steam_input' && recipeUsesSteam(recipe)) {
        const inputTemp = recipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE;
        cycleTime = getTempDependentCycleTime(machine.id, inputTemp, cycleTime);
      }
    }
    if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;

    // Get connected flow
    const flows = productionSolution?.flows?.byNode[target.recipeBoxId];
    if (!flows) return;

    let connectedFlow = 0;
    let ratePerMachine = 0;

    if (ioType === 'output') {
      const outputFlow = flows.outputFlows[ioIndex];
      if (!outputFlow) return;
      
      connectedFlow = outputFlow.connected;
      const output = recipe.outputs[ioIndex];
      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      ratePerMachine = isMineshaftDrill ? quantity : quantity / cycleTime;
    } else {
      const inputFlow = flows.inputFlows[ioIndex];
      if (!inputFlow) return;
      
      connectedFlow = inputFlow.connected;
      const input = recipe.inputs[ioIndex];
      ratePerMachine = isMineshaftDrill ? input.quantity : input.quantity / cycleTime;
    }

    if (ratePerMachine <= 0) return;

    // Calculate new machine count: (connected + target_excess) / rate_per_machine
    const newMachineCount = (connectedFlow + targetExcess) / ratePerMachine;

    // Update the machine count of the node
    updateNodeData(target.recipeBoxId, data => ({ ...data, machineCount: newMachineCount }));
    triggerRecalculation('machineCount');
  }, [targetProducts, nodes, productionSolution, triggerRecalculation]);

  const handleRemoveTarget = useCallback((targetId) => {
    const target = targetProducts.find(t => t.id === targetId);
    if (target) {
      setTargetProducts(prev => prev.filter(t => t.id !== targetId));
      updateNodeData(target.recipeBoxId, data => ({ ...data, isTarget: false }));
    }
  }, [targetProducts]);

  const onNodeClick = useCallback((event, node) => {
    if (event.shiftKey && !event.ctrlKey && !event.altKey) toggleTargetStatus(node);
    else if (event.ctrlKey && event.altKey) deleteRecipeBoxAndTarget(node.id);
  }, [toggleTargetStatus, deleteRecipeBoxAndTarget]);

  const onNodeDoubleClick = useCallback((event, node) => {
    event.stopPropagation(); 
    setEditingNodeId(node.id); 
    setEditingMachineCount(String(node.data?.machineCount ?? 0)); 
    setShowMachineCountEditor(true);
  }, []);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const onNodeMiddleClick = useCallback((nodeId) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) {
      return;
    }
    // Create a copy of the node data
    const copiedRecipe = { ...node.data.recipe };
    const copiedMachine = node.data.machine;
    const copiedMachineCount = node.data.machineCount;
    
    setPendingNode({
      recipe: copiedRecipe,
      machine: copiedMachine,
      machineCount: copiedMachineCount
    });
  }, []);

  const handleCanvasMouseMove = useCallback((event) => {
    if (!reactFlowWrapper.current) return;
    
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    setMousePosition({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    });
  }, []);

  const handleCanvasClick = useCallback((event) => {
    if (!pendingNode || event.button !== 0) return; // Only left click
    
    event.stopPropagation();
    
    if (!reactFlowInstance.current) return;
    
    const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!reactFlowBounds) return;
    
    // Convert screen coordinates to flow coordinates using ReactFlow's screenToFlowPosition method
    const position = reactFlowInstance.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    
    // Center the node at the mouse position by offsetting half the width and height
    position.x -= 160; // Half of typical node width (320 / 2)
    position.y -= 150; // Half of typical node height (roughly 300 / 2)
    
    const newNodeId = `node-${nodeId}`;
    
    const newNode = {
      id: newNodeId,
      type: 'custom',
      position,
      data: {
        recipe: pendingNode.recipe,
        machine: pendingNode.machine,
        machineCount: pendingNode.machineCount,
        displayMode,
        machineDisplayMode,
        leftHandles: pendingNode.recipe.inputs.length,
        rightHandles: pendingNode.recipe.outputs.length,
        onInputClick: openRecipeSelectorForInput,
        onOutputClick: openRecipeSelectorForOutput,
        onDrillSettingsChange: handleDrillSettingsChange,
        onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange,
        onTreeFarmSettingsChange: handleTreeFarmSettingsChange,
        onIndustrialFireboxSettingsChange: handleIndustrialFireboxSettingsChange,
        onTemperatureSettingsChange: handleTemperatureSettingsChange,
        onBoilerSettingsChange: handleBoilerSettingsChange,
        onChemicalPlantSettingsChange: handleChemicalPlantSettingsChange,
        onMiddleClick: onNodeMiddleClick,
        onHandleDoubleClick: handleHandleDoubleClick,
        globalPollution,
        isTarget: false,
        flows: null,
        suggestions: []
      },
      sourcePosition: 'right',
      targetPosition: 'left'
    };
    
    setNodes((nds) => [...nds, newNode]);
    setNodeId((id) => id + 1);
    setPendingNode(null);
    triggerRecalculation('node');
  }, [pendingNode, nodeId, displayMode, machineDisplayMode, openRecipeSelectorForInput, openRecipeSelectorForOutput,
    handleDrillSettingsChange, handleLogicAssemblerSettingsChange, handleTreeFarmSettingsChange,
    handleIndustrialFireboxSettingsChange, handleTemperatureSettingsChange, handleBoilerSettingsChange,
    handleChemicalPlantSettingsChange, globalPollution, setNodes, onNodeMiddleClick]);

  const handleCancelPlacement = useCallback((event) => {
    if (event.button === 2) { // Right click
      setPendingNode(null);
    }
  }, []);

  const handleMachineCountUpdate = useCallback((propagate = false) => {
    let value = parseFloat(editingMachineCount);
    if (isNaN(value) || value < 0) {
      if (newNodePendingMachineCount) {
        // If value is negative or invalid for new node, prompt user
        alert('Machine count must be 0 or greater. Please enter a valid number.');
        return; // Don't close, let user try again
      }
      // For existing nodes, default to 0 (allow disabling)
      value = 0;
    }
    
    if (editingNodeId && !newNodePendingMachineCount) {
      // Editing existing node
      const oldMachineCount = nodes.find(n => n.id === editingNodeId)?.data?.machineCount || 0;
      
      if (propagate && oldMachineCount > 0 && value !== oldMachineCount) {
        // Build graph for propagation
        const graph = buildProductionGraph(nodes, edges);
        const flows = productionSolution?.flows;
        
        if (flows) {
          // Propagate machine count changes
          const newMachineCounts = propagateMachineCount(editingNodeId, oldMachineCount, value, graph, flows);
          
          // Apply propagated machine counts
          setNodes(nds => nds.map(n => {
            const propagatedCount = newMachineCounts.get(n.id);
            if (propagatedCount !== undefined) {
              return { ...n, data: { ...n.data, machineCount: propagatedCount } };
            }
            return n;
          }));
        } else {
          // Fallback to just updating this node
          updateNodeData(editingNodeId, data => ({ ...data, machineCount: value }));
        }
      } else {
        // No propagation - just update this node
        updateNodeData(editingNodeId, data => ({ ...data, machineCount: value }));
      }
    } else if (newNodePendingMachineCount) {
      // Creating new node
      updateNodeData(newNodePendingMachineCount, data => ({ ...data, machineCount: value }));
    }
    
    setShowMachineCountEditor(false); 
    setEditingNodeId(null); 
    setEditingMachineCount('');
    setNewNodePendingMachineCount(null);
    triggerRecalculation('machineCount');
  }, [editingNodeId, editingMachineCount, newNodePendingMachineCount, nodes, edges, productionSolution, setNodes, deleteRecipeBoxAndTarget, triggerRecalculation]);

  const handleMachineCountCancel = useCallback(() => {
    if (newNodePendingMachineCount) {
      deleteRecipeBoxAndTarget(newNodePendingMachineCount);
      // Return to product/machine selection
      setShowRecipeSelector(true);
      setSelectedProduct(null);
      setSelectedMachine(null);
      setSelectorMode('product');
    }
    setShowMachineCountEditor(false);
    setEditingNodeId(null);
    setEditingMachineCount('');
    setNewNodePendingMachineCount(null);
  }, [newNodePendingMachineCount, deleteRecipeBoxAndTarget]);

  const handleCompute = useCallback(() => {
    if (targetProducts.length === 0) {
      alert('No target recipes. Please add target recipes (Shift+Click a node) before computing.');
      return;
    }
    
    const result = computeMachines(nodes, edges, targetProducts);
    
    if (result.success) {
      // Apply updates to nodes
      setNodes(nds => nds.map(n => {
        const newCount = result.updates.get(n.id);
        return newCount !== undefined
          ? { ...n, data: { ...n.data, machineCount: newCount } }
          : n;
      }));
      
      triggerRecalculation('machineCount');
      
      alert(`Success! Updated ${result.updates.size} nodes to balance production.\n\nCheck console for detailed LP solver output.`);
    } else {
      alert(result.message || 'No changes needed - production line is already balanced.');
    }
  }, [targetProducts, nodes, edges, setNodes, triggerRecalculation]);

  const getAvailableRecipes = () => {
    
    if (!selectedProduct) return [];
    
    const product = getProduct(selectedProduct.id);
    const producers = getRecipesProducingProductFiltered(selectedProduct.id);
    const consumers = getRecipesUsingProduct(selectedProduct.id);
    
    // Check special recipes
    const specialRecipes = [DEFAULT_DRILL_RECIPE, DEFAULT_LOGIC_ASSEMBLER_RECIPE, DEFAULT_TREE_FARM_RECIPE, 
      DEFAULT_WASTE_FACILITY_RECIPE, DEFAULT_LIQUID_DUMP_RECIPE, DEFAULT_LIQUID_BURNER_RECIPE];
    const specialProducers = specialRecipes.filter(sr => 
      getSpecialRecipeOutputs(sr.id).includes(selectedProduct.id)
    );
    
    // Special consumers need type-based matching for waste facility, liquid dump, and burner
    const specialConsumers = specialRecipes.filter(sr => {
      const inputs = getSpecialRecipeInputs(sr.id);
      
      // Exact match for inputs
      if (inputs.includes(selectedProduct.id)) return true;
      
      // Type-based matching for special recipes
      if (product) {
        // Waste facility accepts any item or fluid
        if (sr.id === 'r_underground_waste_facility') return true;
        
        // Liquid dump and burner accept any fluid
        if ((sr.id === 'r_liquid_dump' || sr.id === 'r_liquid_burner') && product.type === 'fluid') {
          return true;
        }
      }
      
      return false;
    });
    
    if (recipeFilter === 'producers') {
      return [...producers, ...specialProducers];
    }
    if (recipeFilter === 'consumers') {
      return [...consumers, ...specialConsumers];
    }
    
    // All recipes - combine and deduplicate
    return Array.from(new Map(
      [...producers, ...consumers, ...specialProducers, ...specialConsumers]
        .map(r => [r.id, r])
    ).values());
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
        
        // Determine import type
        const isDataImport = imported.products || imported.machines || imported.recipes;
        const isCanvasImport = imported.canvas;
        
        // Handle data import (products, machines, recipes)
        if (isDataImport) {
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
            updateMachines(currentMachines); 
            updateRecipes([...recipesWithoutImportedMachines, ...cleanedRecipes]);
          }
          
          if (!isCanvasImport) {
            alert('Data import successful!');
            window.location.reload();
            return;
          }
        }
        
        // Handle canvas import (validate and load)
        if (isCanvasImport) {
          // Validate that all required products/recipes/machines exist
          const canvasNodes = imported.canvas.nodes || [];
          const missingItems = [];
          
          canvasNodes.forEach(node => {
            const machineId = node.data?.recipe?.machine_id;
            
            if (machineId && !getMachine(machineId)) {
              missingItems.push(`Machine: ${machineId}`);
            }
            
            node.data?.recipe?.inputs?.forEach(input => {
              if (input.product_id !== 'p_variableproduct' && !getProduct(input.product_id)) {
                missingItems.push(`Product: ${input.product_id}`);
              }
            });
            
            node.data?.recipe?.outputs?.forEach(output => {
              if (output.product_id !== 'p_variableproduct' && !getProduct(output.product_id)) {
                missingItems.push(`Product: ${output.product_id}`);
              }
            });
          });
          
          if (missingItems.length > 0) {
            const uniqueMissing = [...new Set(missingItems)];
            alert(`Cannot import canvas - missing items:\n${uniqueMissing.slice(0, 10).join('\n')}${uniqueMissing.length > 10 ? `\n...and ${uniqueMissing.length - 10} more` : ''}`);
            event.target.value = '';
            return;
          }
          
          if (!window.confirm('Clear current canvas and load imported layout?')) {
            event.target.value = '';
            return;
          }
          
          // Process nodes with all callbacks
          const restoredNodes = canvasNodes.map(node => {
            const machine = getMachine(node.data?.recipe?.machine_id);
            let recipe = node.data?.recipe;
            if (machine && recipe && !recipe.outputs?.some(o => o.temperature !== undefined)) {
              recipe = initializeRecipeTemperatures(recipe, machine.id);
            }
            return { 
              ...node, 
              data: { 
                ...node.data, 
                recipe, 
                machineCount: node.data.machineCount ?? 1, 
                displayMode, 
                machineDisplayMode,
                onInputClick: openRecipeSelectorForInput, 
                onOutputClick: openRecipeSelectorForOutput, 
                onDrillSettingsChange: handleDrillSettingsChange,
                onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange, 
                onTreeFarmSettingsChange: handleTreeFarmSettingsChange, 
                onIndustrialFireboxSettingsChange: handleIndustrialFireboxSettingsChange, 
                onTemperatureSettingsChange: handleTemperatureSettingsChange, 
                onBoilerSettingsChange: handleBoilerSettingsChange,
                onChemicalPlantSettingsChange: handleChemicalPlantSettingsChange,
                onMiddleClick: onNodeMiddleClick,
                onHandleDoubleClick: handleHandleDoubleClick,
                globalPollution,
                flows: null,
                suggestions: []
              }
            };
          });
          
          // Set all state directly - NO RELOAD
          setNodes(restoredNodes);
          setEdges(imported.canvas.edges || []);
          setTargetProducts(imported.canvas.targetProducts || []);
          setSoldProducts(imported.canvas.soldProducts || {});
          setFavoriteRecipes(imported.canvas.favoriteRecipes || []);
          setLastDrillConfig(imported.canvas.lastDrillConfig || null);
          setLastAssemblerConfig(imported.canvas.lastAssemblerConfig || null);
          setLastTreeFarmConfig(imported.canvas.lastTreeFarmConfig || null);
          setLastFireboxConfig(imported.canvas.lastFireboxConfig || null);
          setLastWasteFacilityConfig(imported.canvas.lastWasteFacilityConfig || null);
          setNodeId(imported.canvas.nodeId || 0);
          setTargetIdCounter(imported.canvas.targetIdCounter || 0);
          
          clearFlowCache();
          triggerRecalculation('node');
          alert('Canvas import successful!');
        }
        
      } catch (error) { 
        alert(`Import failed: ${error.message}`); 
      }
    };
    reader.readAsText(file); 
    event.target.value = '';
  }, [displayMode, machineDisplayMode, globalPollution, openRecipeSelectorForInput, openRecipeSelectorForOutput,
    handleDrillSettingsChange, handleLogicAssemblerSettingsChange, handleTreeFarmSettingsChange,
    handleIndustrialFireboxSettingsChange, handleTemperatureSettingsChange, handleBoilerSettingsChange,
    handleChemicalPlantSettingsChange, onNodeMiddleClick, setNodes, setEdges, setTargetProducts,
    setSoldProducts, setFavoriteRecipes, setLastDrillConfig, setLastAssemblerConfig,
    setLastTreeFarmConfig, setLastFireboxConfig, setNodeId, setTargetIdCounter]);

  const handleExportData = useCallback(() => {
    const blob = new Blob([JSON.stringify({ products, machines, recipes }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `industrialist-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [products, machines, recipes]);

  const handleExportCanvas = useCallback(() => {
    // Strip transient runtime data (flows, suggestions) from nodes before export
    const cleanedNodes = nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        flows: undefined,
        suggestions: undefined
      }
    }));
    
    const canvas = { 
      nodes: cleanedNodes, 
      edges, 
      targetProducts, 
      nodeId, 
      targetIdCounter, 
      soldProducts, 
      favoriteRecipes, 
      lastDrillConfig, 
      lastAssemblerConfig, 
      lastTreeFarmConfig, 
      lastFireboxConfig,
      lastWasteFacilityConfig
    };
    const blob = new Blob([JSON.stringify({ canvas }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `industrialist-canvas-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts, favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig]);

  const handleExport = useCallback(() => {
    // Strip transient runtime data from nodes before export
    const cleanedNodes = nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        flows: undefined,
        suggestions: undefined
      }
    }));
    
    const blob = new Blob([JSON.stringify({ products, machines, recipes, canvas: { nodes: cleanedNodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts, favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig, lastWasteFacilityConfig } }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `industrialist-export-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url);
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts, favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig]);

  const handleRestoreDefaults = useCallback(() => {
    if (window.confirm('Restore all data to defaults? This will clear the canvas and reset all products, machines, and recipes.')) {
      restoreDefaults(); setNodes([]); setEdges([]); setNodeId(0); setTargetProducts([]); setTargetIdCounter(0); setSoldProducts({}); setFavoriteRecipes([]); setLastDrillConfig(null); setLastAssemblerConfig(null); setLastTreeFarmConfig(null); setLastFireboxConfig(null); setLastWasteFacilityConfig(null); window.location.reload();
    }
  }, [setNodes, setEdges]);

  // Listen for theme changes (including edge settings)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'industrialist_theme') {
        try {
          const theme = JSON.parse(e.newValue);
          setEdgeSettings({
            edgePath: theme.edgePath || 'orthogonal',
            edgeStyle: theme.edgeStyle || 'animated'
          });
        } catch (err) {
          console.error('Error parsing theme from storage:', err);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Also listen for theme editor closing (same window)
  useEffect(() => {
    if (!showThemeEditor) {
      const theme = loadTheme();
      setEdgeSettings({
        edgePath: theme.edgePath || 'orthogonal',
        edgeStyle: theme.edgeStyle || 'animated'
      });
    }
  }, [showThemeEditor]);

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()) && (filterType === 'all' || p.type === filterType)).sort((a, b) => {
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
    if (sortBy === 'price_asc') return (a.price === 'Variable' ? Infinity : a.price) - (b.price === 'Variable' ? Infinity : b.price);
    if (sortBy === 'price_desc') return (b.price === 'Variable' ? -Infinity : b.price) - (a.price === 'Variable' ? -Infinity : a.price);
    if (sortBy === 'rp_asc') return (a.rp_multiplier === 'Variable' ? Infinity : a.rp_multiplier) - (b.rp_multiplier === 'Variable' ? Infinity : b.rp_multiplier);
    return (b.rp_multiplier === 'Variable' ? -Infinity : b.rp_multiplier) - (a.rp_multiplier === 'Variable' ? -Infinity : a.rp_multiplier);
  });

  const filteredMachines = machines.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
    (m.id === 'm_mineshaft_drill' || m.id === 'm_logic_assembler' || m.id === 'm_tree_farm' || 
     m.id === 'm_underground_waste_facility' || m.id === 'm_liquid_dump' || m.id === 'm_liquid_burner' || 
     getRecipesForMachine(m.id).length > 0)).sort((a, b) => a.name.localeCompare(b.name));

  const handleMachineSelect = (machine) => {
  if (machine.id === 'm_mineshaft_drill') {
    createRecipeBox(DEFAULT_DRILL_RECIPE, 1);
    resetSelector();
  } else if (machine.id === 'm_logic_assembler') {
    createRecipeBox(DEFAULT_LOGIC_ASSEMBLER_RECIPE, 1);
    resetSelector();
  } else if (machine.id === 'm_tree_farm') {
    createRecipeBox(DEFAULT_TREE_FARM_RECIPE, 1);
    resetSelector();
  } else if (machine.id === 'm_underground_waste_facility') {
    createRecipeBox(DEFAULT_WASTE_FACILITY_RECIPE, 1);
    resetSelector();
  } else if (machine.id === 'm_liquid_dump') {
    createRecipeBox(DEFAULT_LIQUID_DUMP_RECIPE, 1);
    resetSelector();
  } else if (machine.id === 'm_liquid_burner') {
    createRecipeBox(DEFAULT_LIQUID_BURNER_RECIPE, 1);
    resetSelector();
  } else {
    setSelectedMachine(machine);
  }
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
      <ReactFlow 
        ref={reactFlowWrapper} 
        nodes={nodes} 
        edges={edges} 
        onNodesChange={onNodesChange} 
        onEdgesChange={onEdgesChange} 
        onConnect={onConnect} 
        onNodeClick={onNodeClick} 
        onNodeDoubleClick={onNodeDoubleClick}
        onMouseMove={handleCanvasMouseMove}
        onClick={handleCanvasClick}
        onContextMenu={handleCancelPlacement}
        onInit={(instance) => { reactFlowInstance.current = instance; }}
        nodeTypes={nodeTypes} 
        edgeTypes={edgeTypes} 
        panOnDrag={[0, 2]}
        panOnScroll={false}
        selectionOnDrag={false}
        fitView
        elevateNodesOnSelect={false}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        minZoom={0.1}
        maxZoom={4}
        connectionLineType={edgeSettings.edgePath === 'straight' ? 'straight' : edgeSettings.edgePath === 'orthogonal' ? 'step' : 'default'}
        connectionLineStyle={{ 
          stroke: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
          strokeWidth: 2,
          strokeDasharray: edgeSettings.edgeStyle === 'animated' || edgeSettings.edgeStyle === 'dashed' ? '8 4' : 'none'
        }}
        defaultEdgeOptions={{ type: 'custom' }}>
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
                    <div className="stat-item"><div className="stat-label">Total Pollution:</div><div className="stat-value" style={{ color: stats.totalPollution >= 0 ? 'var(--stat-negative)' : 'var(--stat-positive)' }}>{stats.totalPollution.toFixed(2)}%/hr</div></div>
                    <div className="stat-item"><div className="stat-label">Total Minimum Model Count:</div><div className="stat-value">{stats.totalModelCount.toFixed(0)}</div></div>
                    <div className="stat-item"><div className="stat-label">Total Profit:</div><div className="stat-value" style={{ color: totalProfit >= 0 ? 'var(--stat-positive)' : 'var(--stat-negative)' }}>
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
                          title={isPollutionPaused ? 'Resume pollution change' : 'Pause pollution change'}
                        >
                          {isPollutionPaused ? '▶' : '❚❚'}
                        </button>
                        <input 
                          id="global-pollution" 
                          type="number"
                          step="0.0001"
                          value={globalPollution} 
                          onFocus={() => setPollutionInputFocused(true)}
                          onBlur={(e) => { 
                            setPollutionInputFocused(false); 
                            const val = e.target.value; 
                            const num = parseFloat(val);
                            setGlobalPollution(!isNaN(num) && isFinite(num) ? parseFloat(num.toFixed(4)) : 0); 
                          }}
                          onChange={(e) => setGlobalPollution(e.target.value === '' ? '' : parseFloat(e.target.value))} 
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
              <button onClick={() => { 
                setNodes([]); 
                setEdges([]); 
                setNodeId(0); 
                setTargetProducts([]); 
                setTargetIdCounter(0); 
                setSoldProducts({}); 
                setFavoriteRecipes([]);
                setLastDrillConfig(null); 
                setLastAssemblerConfig(null); 
                setLastTreeFarmConfig(null);
                setLastFireboxConfig(null);
                setLastWasteFacilityConfig(null);
                clearFlowCache(); 
                triggerRecalculation('node');
              }} 
                className="btn btn-secondary">Clear All</button>
              <button onClick={handleImport} className="btn btn-secondary">Import JSON</button>
              <button onClick={handleExportData} className="btn btn-secondary">Export Data</button>
              <button onClick={handleExportCanvas} className="btn btn-secondary">Export Canvas</button>
              <button onClick={handleRestoreDefaults} className="btn btn-secondary">Restore Defaults</button>
              <button onClick={() => setShowThemeEditor(true)} className="btn btn-secondary">Theme Editor</button>
              <button onClick={() => window.open('https://github.com/Pollywrath/Industrialist-Production-Calculator', '_blank')} className="btn btn-secondary">Source Code</button>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={processImport} />

      {(showMachineCountEditor || keepOverlayDuringTransition) && (
        <div className="modal-overlay" onClick={handleMachineCountCancel}>
          {showMachineCountEditor && (
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '450px' }}>
              <h2 className="modal-title">Edit Machine Count</h2>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: '10px' }}>
                  Machine Count:</label>
                <input type="number" min="0" step="0.1" value={editingMachineCount} onChange={(e) => setEditingMachineCount(e.target.value)}
                  onKeyPress={(e) => { if (e.key === 'Enter') handleMachineCountUpdate(false); }} className="input" placeholder="Enter machine count" autoFocus />
                <p style={{ marginTop: '8px', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Must be a non-negative number (can be decimal)</p>
              </div>
              
              {editingNodeId && !newNodePendingMachineCount && (
                <div style={{ 
                  marginBottom: '20px', 
                  padding: '12px', 
                  background: 'rgba(212, 166, 55, 0.1)', 
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-divider)'
                }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Apply:</strong> Changes only this box
                    </div>
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>Apply to All:</strong> Changes this box and propagates to connected boxes
                    </div>
                  </div>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleMachineCountCancel} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
                <button onClick={() => handleMachineCountUpdate(false)} className="btn btn-primary" style={{ flex: 1 }}>Apply</button>
                {editingNodeId && !newNodePendingMachineCount && (
                  <button 
                    onClick={() => handleMachineCountUpdate(true)} 
                    className="btn btn-primary" 
                    style={{ 
                      flex: 1,
                      background: 'var(--color-primary-hover)',
                      fontWeight: 700
                    }}
                    title="Apply changes and propagate to connected nodes"
                  >
                    Apply to All
                  </button>
                )}
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
                            {machine.id === 'm_mineshaft_drill' || machine.id === 'm_logic_assembler' || machine.id === 'm_tree_farm' ? 'Click to create box' : `${getRecipesForMachine(machine.id).length} recipe(s)`}
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
                  const machineCount = recipeMachineCounts[recipe.id] ?? 1;
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
                          
                          const initialCount = machineCount <= 0 ? 1 : machineCount;
                          const wasZero = recipeMachineCounts[recipe.id] === 0 || recipeMachineCounts[recipe.id] === undefined;
                          
                          // Create node then open editor for machine count button
                          const newNodeId = createRecipeBox(recipe, initialCount);
                          setKeepOverlayDuringTransition(true);
                          setShowRecipeSelector(false);
                          setTimeout(() => {
                            setNewNodePendingMachineCount(newNodeId);
                            setEditingNodeId(newNodeId);
                            setEditingMachineCount(String(initialCount));
                            setShowMachineCountEditor(true);
                            setKeepOverlayDuringTransition(false);
                            
                            // Store whether this was from zero for later propagation
                            if (wasZero && autoConnectTarget) {
                              // Will be handled in handleMachineCountUpdate
                            }
                          }, 50);
                        }}
                        style={{
                          minWidth: '70px',
                          padding: '10px 12px',
                          background: autoConnectTarget && machineCount <= 0 ? 'var(--delete-bg)' : 'var(--color-primary)',
                          color: autoConnectTarget && machineCount <= 0 ? 'var(--delete-color)' : 'var(--color-primary-dark)',
                          borderRadius: 'var(--radius-sm)',
                          fontWeight: 700,
                          fontSize: '18px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          userSelect: 'none',
                          border: autoConnectTarget && machineCount <= 0 ? '2px solid var(--delete-color)' : '2px solid transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (autoConnectTarget && machineCount <= 0) {
                            e.currentTarget.style.background = 'var(--delete-hover-bg)';
                            e.currentTarget.style.color = 'var(--delete-hover-color)';
                          } else {
                            e.currentTarget.style.background = 'var(--color-primary-hover)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                            e.currentTarget.style.borderColor = 'var(--color-primary-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (autoConnectTarget && machineCount <= 0) {
                            e.currentTarget.style.background = 'var(--delete-bg)';
                            e.currentTarget.style.color = 'var(--delete-color)';
                          } else {
                            e.currentTarget.style.background = 'var(--color-primary)';
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.borderColor = 'transparent';
                          }
                        }}
                        title={autoConnectTarget ? (machineCount <= 0 ? "Cannot create: machine count is 0" : `Click to edit before creating (${Number.isInteger(machineCount) ? machineCount : machineCount.toFixed(2)} calculated)`) : "Click to set machine count"}
                      >
                        {Number.isInteger(machineCount) ? machineCount : machineCount.toFixed(2)}
                      </div>
                      <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={(e) => {
                        e.stopPropagation();
                        const currentMachineCount = machineCount;
                        
                        // If machine count is 0, create with 1 and open editor
                        if (currentMachineCount <= 0) {
                          const newNodeId = createRecipeBox(recipe, 1);
                          setKeepOverlayDuringTransition(true);
                          setShowRecipeSelector(false);
                          setTimeout(() => {
                            setNewNodePendingMachineCount(newNodeId);
                            setEditingNodeId(newNodeId);
                            setEditingMachineCount('1');
                            setShowMachineCountEditor(true);
                            setKeepOverlayDuringTransition(false);
                          }, 50);
                        } else {
                          // Machine count > 0, create box and potentially propagate
                          createRecipeBox(recipe);
                          
                          // If auto-connecting and machine count changed from calculated
                          if (autoConnectTarget) {
                            const calculatedCount = recipeMachineCounts[recipe.id] || 1;
                            if (Math.abs(currentMachineCount - calculatedCount) > 0.001) {
                              // Machine count was manually changed - will propagate on creation
                              // This is handled in createRecipeBox through the connection
                            }
                          }
                          
                          resetSelector();
                        }
                      }}>
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
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '800px', maxHeight: '85vh' }}>
            <h2 className="modal-title">Target Products</h2>
            <div className="modal-content flex-col" style={{ maxHeight: '70vh', marginBottom: '20px' }}>
              {targetProducts.length === 0 ? (
                <div className="empty-state">No target products yet. Shift+Click a recipe box to mark it as a target.</div>
              ) : (
                targetProducts.map(target => {
                  const node = nodes.find(n => n.id === target.recipeBoxId);
                  if (!node) return null;

                  const recipe = node.data?.recipe;
                  const machine = node.data?.machine;
                  const machineCount = node.data?.machineCount || 0;
                  if (!recipe) return null;

                  let cycleTime = recipe.cycle_time;
                  if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
                  
                  // Apply temperature-dependent cycle time if applicable
                  const isTempDependent = hasTempDependentCycle(machine?.id);
                  if (isTempDependent) {
                    const tempInfo = TEMP_DEPENDENT_MACHINES[machine.id];
                    if (tempInfo?.type === 'steam_input' && recipeUsesSteam(recipe)) {
                      const inputTemp = recipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE;
                      cycleTime = getTempDependentCycleTime(machine.id, inputTemp, cycleTime);
                    }
                  }
                  if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;

                  const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';

                  // Get flow data
                  const flows = productionSolution?.flows?.byNode[target.recipeBoxId];
                  
                  // Calculate current rates, connected flows, and excess/deficiency
                  const flowData = { inputs: {}, outputs: {} };

                  recipe.inputs.forEach((input, idx) => {
                    if (typeof input.quantity === 'number') {
                      const ratePerMachine = isMineshaftDrill ? input.quantity : input.quantity / cycleTime;
                      const totalRate = ratePerMachine * machineCount;
                      const connectedFlow = flows?.inputFlows[idx]?.connected || 0;
                      const deficiency = totalRate - connectedFlow; // How much MORE is needed beyond connected
                      
                      flowData.inputs[idx] = {
                        totalRate,
                        connectedFlow,
                        deficiency: Math.max(0, deficiency)
                      };
                    }
                  });

                  recipe.outputs.forEach((output, idx) => {
                    const quantity = output.quantity;
                    if (typeof quantity === 'number') {
                      const ratePerMachine = isMineshaftDrill ? quantity : quantity / cycleTime;
                      const totalRate = ratePerMachine * machineCount;
                      const connectedFlow = flows?.outputFlows[idx]?.connected || 0;
                      const excess = totalRate - connectedFlow; // How much is LEFT OVER after connected
                      
                      flowData.outputs[idx] = {
                        totalRate,
                        connectedFlow,
                        excess: Math.max(0, excess)
                      };
                    }
                  });

                  const handleTargetExcessChange = (ioType, ioIndex, targetExcess) => {
                    handleUpdateTarget(target.id, ioType, ioIndex, targetExcess);
                  };

                  return (
                    <div key={target.id} style={{
                      padding: '20px',
                      background: 'var(--bg-main)',
                      border: '2px solid var(--border-primary)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '15px'
                    }}>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <div>
                          <div style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600 }}>
                            {recipe.name}
                          </div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
                            Machine Count: {machineCount.toFixed(4)}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleRemoveTarget(target.id)} 
                          className="btn btn-delete"
                          style={{ padding: '6px 12px' }}
                        >
                          Remove
                        </button>
                      </div>

                      {/* Two column layout */}
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr', 
                        gap: '20px',
                        borderTop: '1px solid var(--border-divider)',
                        paddingTop: '15px'
                      }}>
                        {/* Inputs Column */}
                        <div>
                          <div style={{ 
                            color: 'var(--input-text)', 
                            fontSize: '14px', 
                            fontWeight: 600,
                            marginBottom: '12px',
                            textAlign: 'center'
                          }}>
                            Inputs
                          </div>
                          {recipe.inputs.map((input, idx) => {
                            const data = flowData.inputs[idx];
                            if (!data) return null;
                            return (
                              <TargetExcessInput
                                key={idx}
                                productName={getProductName(input.product_id, getProduct)}
                                connectedFlow={data.connectedFlow}
                                currentExcess={data.deficiency}
                                onTargetExcessCommit={(val) => handleTargetExcessChange('input', idx, val)}
                                styleType="input"
                              />
                            );
                          })}
                        </div>

                        {/* Outputs Column */}
                        <div>
                          <div style={{ 
                            color: 'var(--output-text)', 
                            fontSize: '14px', 
                            fontWeight: 600,
                            marginBottom: '12px',
                            textAlign: 'center'
                          }}>
                            Outputs
                          </div>
                          {recipe.outputs.map((output, idx) => {
                            const data = flowData.outputs[idx];
                            if (!data) return null;
                            return (
                              <TargetExcessInput
                                key={idx}
                                productName={getProductName(output.product_id, getProduct)}
                                connectedFlow={data.connectedFlow}
                                currentExcess={data.excess}
                                onTargetExcessCommit={(val) => handleTargetExcessChange('output', idx, val)}
                                styleType="output"
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <button onClick={() => setShowTargetsModal(false)} className="btn btn-secondary">Close</button>
          </div>
        </div>
      )}

      {showThemeEditor && <ThemeEditor onClose={() => setShowThemeEditor(false)} />}

      {pendingNode && (
        <div 
          className="pending-node-preview"
          style={{
            left: `${mousePosition.x + 20}px`,
            top: `${mousePosition.y + 20}px`
          }}
        >
          <div className="pending-node-recipe-name">{pendingNode.recipe.name}</div>
          <div className="pending-node-machine-name">{pendingNode.machine.name}</div>
          <div className="pending-node-machine-name">Count: {pendingNode.machineCount}</div>
          <div className="pending-node-hint">Left-click to place | Right-click to cancel</div>
        </div>
      )}
      </div>
  );
}

export default App;