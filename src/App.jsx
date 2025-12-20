import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './components/CustomNode';
import CustomEdge from './components/CustomEdge';
import ThemeEditor, { applyTheme, loadTheme } from './components/ThemeEditor';
import { 
  products, machines, recipes, getMachine, getProduct, 
  getRecipesProducingProduct, updateProducts, updateMachines, 
  updateRecipes, saveCanvasState, loadCanvasState, restoreDefaults 
} from './data/dataLoader';
import { 
  getProductName, formatIngredient, filterVariableProducts, formatPollution
} from './utils/variableHandler';
import { 
  calculateOutputTemperature, 
  isTemperatureProduct,
  getDefaultTemperatureSettings,
  DEFAULT_WATER_TEMPERATURE,
  DEFAULT_BOILER_INPUT_TEMPERATURE,
  HEAT_SOURCES
} from './utils/temperatureHandler';
import { 
  DEFAULT_DRILL_RECIPE, DEPTH_OUTPUTS, calculateDrillMetrics 
} from './data/mineshaftDrill';
import { 
  DEFAULT_LOGIC_ASSEMBLER_RECIPE, MICROCHIP_STAGES, 
  calculateLogicAssemblerMetrics 
} from './data/logicAssembler';
import { 
  solveProductionNetwork, 
  getExcessProducts,
  getDeficientProducts,
  calculateSoldProductsProfit 
} from './solvers/productionSolver';

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

// Recipe filters: exclude special machines (drill, assembler) from regular recipe lists
const getRecipesUsingProduct = (productId) => 
  recipes.filter(r => 
    !['r_mineshaft_drill_01', 'r_logic_assembler_01'].includes(r.id) && 
    r.inputs.some(i => i.product_id === productId && i.product_id !== 'p_variableproduct')
  );

const getRecipesProducingProductFiltered = (productId) => 
  recipes.filter(r => 
    !['r_mineshaft_drill_01', 'r_logic_assembler_01'].includes(r.id) && 
    r.outputs.some(o => o.product_id === productId && o.product_id !== 'p_variableproduct')
  );

const getRecipesForMachine = (machineId) => 
  recipes.filter(r => r.machine_id === machineId);

// Check product compatibility with special machines
const canDrillUseProduct = (productId) => 
  ['p_copper_drill_head', 'p_iron_drill_head', 'p_steel_drill_head', 'p_tungsten_carbide_drill_head', 'p_water', 'p_acetic_acid', 'p_hydrochloric_acid', 'p_sulfuric_acid', 'p_machine_oil'].includes(productId) || 
  Object.values(DEPTH_OUTPUTS).some(outputs => outputs.some(o => o.product_id === productId));

const canLogicAssemblerUseProduct = (productId) => 
  ['p_logic_plate', 'p_copper_wire', 'p_semiconductor', 'p_gold_wire', 'p_machine_oil'].includes(productId) || 
  MICROCHIP_STAGES.some(s => s.productId === productId);

/**
 * Helper function to initialize temperature data for recipe outputs
 * Called when a recipe box is first created
 */
const initializeRecipeTemperatures = (recipe, machineId) => {
  const heatSource = HEAT_SOURCES[machineId];
  
  if (!heatSource) {
    // Not a heat source, return recipe as-is
    return recipe;
  }

  // Get default settings for configurable machines
  const defaultSettings = getDefaultTemperatureSettings(machineId);
  
  // Calculate output temperature
  const isBoiler = heatSource.type === 'boiler';
  const inputTemp = isBoiler ? DEFAULT_BOILER_INPUT_TEMPERATURE : DEFAULT_WATER_TEMPERATURE;
  
  const outputTemp = calculateOutputTemperature(
    machineId, 
    defaultSettings,
    inputTemp,
    null
  );

  // Apply temperature to outputs
  const updatedOutputs = applyTemperatureToOutputs(recipe.outputs, outputTemp, isBoiler, heatSource, inputTemp);

  return {
    ...recipe,
    outputs: updatedOutputs,
    temperatureSettings: defaultSettings
  };
};

/**
 * Apply temperature to recipe outputs based on machine type
 * UNIFIED LOGIC for setting output temperatures and quantities
 */
const applyTemperatureToOutputs = (outputs, temperature, isBoiler, heatSource, inputTemp = DEFAULT_WATER_TEMPERATURE) => {
  const minSteamTemp = heatSource?.minSteamTemp || 100;
  
  return outputs.map(output => {
    if (isBoiler) {
      // Boiler: only steam output gets temperature
      if (output.product_id === 'p_steam') {
        // For boiler, use the higher of calculated temp or first input temp (pass-through)
        const finalTemp = Math.max(temperature, inputTemp);
        
        // Preserve original quantity (stored when quantity was first set to 0)
        const originalQuantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
        
        // Check if temperature is below minimum threshold - if so, no steam is produced
        if (finalTemp < minSteamTemp) {
          return {
            ...output,
            temperature: finalTemp,
            quantity: 0, // No steam below minimum temperature
            originalQuantity: originalQuantity // Store original for restoration
          };
        }
        // Temperature is sufficient - restore original quantity
        return {
          ...output,
          temperature: finalTemp,
          quantity: originalQuantity, // Restore original quantity
          originalQuantity: originalQuantity // Keep tracking original
        };
      }
      return output; // Water output has no temperature
    }
    
    // For all other heat sources: use the higher of calculated temp or input temp (pass-through)
    if (isTemperatureProduct(output.product_id)) {
      const finalTemp = Math.max(temperature, inputTemp);
      return {
        ...output,
        temperature: finalTemp
      };
    }
    return output;
  });
};

function App() {
  // Canvas state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState([]);
  const [nodeId, setNodeId] = useState(0);

  // Wrap onEdgesChange to detect deletions and trigger temperature recalculation
  const onEdgesChange = useCallback((changes) => {
    // Check if any edges are being removed
    const hasRemovals = changes.some(change => change.type === 'remove');
    
    // Apply the changes
    onEdgesChangeBase(changes);
    
    // If edges were removed, recalculate temperatures after state update
    if (hasRemovals) {
      setTimeout(() => {
        setNodes(currentNodes => {
          setEdges(currentEdges => {
            recalculateAllTemperatures(currentNodes, currentEdges);
            return currentEdges;
          });
          return currentNodes;
        });
      }, 0);
    }
  }, [onEdgesChangeBase, setEdges, setNodes]);

  // Recipe selector modal
  const [showRecipeSelector, setShowRecipeSelector] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectorMode, setSelectorMode] = useState('product');
  const [selectorOpenedFrom, setSelectorOpenedFrom] = useState('button');

  // Recipe filtering and sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filterType, setFilterType] = useState('all');
  const [recipeFilter, setRecipeFilter] = useState('all');

  // Auto-connect feature
  const [autoConnectTarget, setAutoConnectTarget] = useState(null);

  // Target products for production goals
  const [targetProducts, setTargetProducts] = useState([]);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [targetIdCounter, setTargetIdCounter] = useState(0);

  // Machine count editor
  const [showMachineCountEditor, setShowMachineCountEditor] = useState(false);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingMachineCount, setEditingMachineCount] = useState('');

  // UI state
  const [menuOpen, setMenuOpen] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [extendedPanelOpen, setExtendedPanelOpen] = useState(false);
  const [extendedPanelClosing, setExtendedPanelClosing] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [globalPollution, setGlobalPollution] = useState(0);
  const [pollutionInputFocused, setPollutionInputFocused] = useState(false);
  const [soldProducts, setSoldProducts] = useState({});
  const [displayMode, setDisplayMode] = useState('perSecond');
  const [machineDisplayMode, setMachineDisplayMode] = useState('perMachine');
  const reactFlowWrapper = useRef(null);
  const fileInputRef = useRef(null);

  // Load theme on mount
  useEffect(() => {
    applyTheme(loadTheme());
  }, []);

  // Load canvas state on mount
  useEffect(() => {
    const savedState = loadCanvasState();
    if (savedState?.nodes) {
      const restoredNodes = savedState.nodes.map(node => {
        // Initialize temperature for any heat source machines that don't have it
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
            machineCount: node.data.machineCount ?? 0,
            displayMode: displayMode,
            machineDisplayMode: machineDisplayMode,
            onInputClick: openRecipeSelectorForInput,
            onOutputClick: openRecipeSelectorForOutput,
            onDrillSettingsChange: handleDrillSettingsChange,
            onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange,
            onTemperatureSettingsChange: handleTemperatureSettingsChange,
            onBoilerSettingsChange: handleBoilerSettingsChange,
          }
        };
      });
      setNodes(restoredNodes);
      setEdges(savedState.edges || []);
      setTargetProducts(savedState.targetProducts || []);
      setSoldProducts(savedState.soldProducts || {});
      setNodeId(savedState.nodeId || 0);
      setTargetIdCounter(savedState.targetIdCounter || 0);
      
      // After loading, recalculate all temperatures based on connections
      setTimeout(() => {
        recalculateAllTemperatures(restoredNodes, savedState.edges || []);
      }, 100);
    }
  }, []);

  // Update all nodes when displayMode changes
  useEffect(() => {
    setNodes(nds => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        displayMode: displayMode
      }
    })));
  }, [displayMode, setNodes]);

  // Update all nodes when machineDisplayMode changes
  useEffect(() => {
    setNodes(nds => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        machineDisplayMode: machineDisplayMode
      }
    })));
  }, [machineDisplayMode, setNodes]);

  // Auto-save canvas state on any change
  useEffect(() => {
    saveCanvasState(nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts);
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts]);

  // Calculate total stats from all recipe boxes
  const calculateTotalStats = useCallback(() => {
    let totalPower = 0;
    let totalPollution = 0;
    let totalModelCount = 0;

    nodes.forEach(node => {
      const recipe = node.data?.recipe;
      if (!recipe) return;

      const machineCount = node.data?.machineCount || 0;

      // Power consumption
      const power = recipe.power_consumption;
      let powerValue = 0;
      if (typeof power === 'number') {
        powerValue = power;
        totalPower += power * machineCount;
      } else if (typeof power === 'object' && power !== null) {
        if ('max' in power) {
          powerValue = power.max;
          totalPower += powerValue * machineCount;
        }
      }

      // Pollution
      const pollution = recipe.pollution;
      if (typeof pollution === 'number') {
        totalPollution += pollution * machineCount;
      }

      // Model count per recipe
      const inputOutputCount = (recipe.inputs?.length || 0) + (recipe.outputs?.length || 0);
      
      const recipeModelCount = 
        Math.ceil(machineCount) + 
        Math.ceil(machineCount * powerValue / 1500000) + 
        Math.ceil(machineCount) * inputOutputCount * 2;
      
      totalModelCount += recipeModelCount;
    });

    return {
      totalPower,
      totalPollution,
      totalModelCount
    };
  }, [nodes]);

  const stats = calculateTotalStats();

  // Solve production network
  const productionSolution = useMemo(() => {
    return solveProductionNetwork(nodes, edges);
  }, [nodes, edges]);

  const excessProductsRaw = useMemo(() => {
    return getExcessProducts(productionSolution);
  }, [productionSolution]);

  const deficientProducts = useMemo(() => {
    return getDeficientProducts(productionSolution);
  }, [productionSolution]);

  // Add isSold property to excess products
  const excessProducts = useMemo(() => {
    return excessProductsRaw.map(item => {
      const shouldAutoSell = typeof item.product.price === 'number' && item.product.price > 0;
      const explicitlySold = soldProducts[item.productId];
      
      return {
        ...item,
        isSold: explicitlySold !== undefined ? explicitlySold : shouldAutoSell
      };
    });
  }, [excessProductsRaw, soldProducts]);

  // Calculate total profit from sold excess products
  const totalProfit = useMemo(() => {
    let profit = 0;
    excessProducts.forEach(item => {
      if (item.isSold && typeof item.product.price === 'number') {
        profit += item.product.price * item.excessRate;
      }
    });
    return profit;
  }, [excessProducts]);

  // Calculate machine counts and costs
  const machineStats = useMemo(() => {
    const machineCounts = {};
    const machineCosts = {};

    nodes.forEach(node => {
      const machine = node.data?.machine;
      const machineCount = node.data?.machineCount || 0;
      
      if (!machine) return;

      const machineId = machine.id;
      const roundedCount = Math.ceil(machineCount);

      if (!machineCounts[machineId]) {
        machineCounts[machineId] = 0;
        machineCosts[machineId] = typeof machine.cost === 'number' ? machine.cost : 0;
      }

      machineCounts[machineId] += roundedCount;
    });

    const stats = Object.keys(machineCounts).map(machineId => {
      const machine = machines.find(m => m.id === machineId);
      const count = machineCounts[machineId];
      const cost = machineCosts[machineId];
      const totalCost = count * cost;

      return {
        machineId,
        machine,
        count,
        cost,
        totalCost
      };
    }).sort((a, b) => a.machine.name.localeCompare(b.machine.name));

    const totalCost = stats.reduce((sum, stat) => sum + stat.totalCost, 0);

    return { stats, totalCost };
  }, [nodes, machines]);

  // Smart number formatting
  const smartFormat = (num) => {
    if (typeof num !== 'number') return num;
    const rounded = Math.round(num * 10000) / 10000;
    return rounded.toString();
  };

  // Metric formatting for large numbers
  const metricFormat = (num) => {
    if (typeof num !== 'number') return num;
    
    if (num >= 1000000000) {
      return smartFormat(num / 1000000000) + 'B';
    } else if (num >= 1000000) {
      return smartFormat(num / 1000000) + 'M';
    } else if (num >= 1000) {
      return smartFormat(num / 1000) + 'k';
    }
    
    return smartFormat(num);
  };

  // Check if current theme is Forest
  const isForestTheme = () => {
    const primaryColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-primary')
      .trim()
      .toLowerCase();
    return primaryColor === '#5fb573';
  };

  const statisticsTitle = isForestTheme() ? "Plant Statistics" : "Plan Statistics";

  // Auto-increment global pollution
  useEffect(() => {
    const interval = setInterval(() => {
      if (pollutionInputFocused) return;
      
      const pollutionPerSecond = stats.totalPollution / 3600;
      setGlobalPollution(prev => {
        if (typeof prev === 'number' && !isNaN(prev) && isFinite(prev)) {
          return parseFloat((prev + pollutionPerSecond).toFixed(4));
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [stats.totalPollution, pollutionInputFocused]);

  // Format power consumption for display
  const formatPowerDisplay = (power) => {
    if (power >= 1000000) return `${(power / 1000000).toFixed(2)} MMF/s`;
    if (power >= 1000) return `${(power / 1000).toFixed(2)} kMF/s`;
    return `${power.toFixed(2)} MF/s`;
  };

  // Update node data while preserving identity
  const updateNodeData = (nodeId, updater) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: updater(n.data) } : n));
  };

  /**
   * UNIFIED TEMPERATURE RECALCULATION
   * Recalculates temperatures for ALL heat source nodes based on their connections
   * Handles both additive sources (geothermal) and boilers
   * Iterates until stable to handle chaining
   */
  const recalculateAllTemperatures = useCallback((currentNodes, currentEdges) => {
    setNodes(nds => {
      let updatedNodes = currentNodes || [...nds];
      let hasChanges = true;
      let iterations = 0;
      const maxIterations = 20;
      
      // Keep iterating until no more changes (handles chaining)
      while (hasChanges && iterations < maxIterations) {
        hasChanges = false;
        iterations++;
        
        updatedNodes = updatedNodes.map(targetNode => {
          const machine = getMachine(targetNode.data?.recipe?.machine_id);
          if (!machine) return targetNode;
          
          const heatSource = HEAT_SOURCES[machine.id];
          if (!heatSource) return targetNode;
          
          const isAdditive = heatSource.type === 'additive';
          const isBoiler = heatSource.type === 'boiler';
          
          // Only recalculate for additive sources and boilers
          if (!isAdditive && !isBoiler) return targetNode;
          
          // Find edges connected to this node's inputs
          const connectedEdges = currentEdges.filter(e => e.target === targetNode.id);
          
          let inputTemp = DEFAULT_WATER_TEMPERATURE;
          let secondInputTemp = null;
          
          if (isBoiler) {
            // Boiler: get temperature from SECOND input (index 1)
            const secondInputEdge = connectedEdges.find(e => {
              const targetInputIndex = parseInt(e.targetHandle.split('-')[1]);
              return targetInputIndex === 1;
            });
            
            if (secondInputEdge) {
              const sourceNode = updatedNodes.find(n => n.id === secondInputEdge.source);
              if (sourceNode) {
                const sourceOutputIndex = parseInt(secondInputEdge.sourceHandle.split('-')[1]);
                const sourceOutput = sourceNode.data?.recipe?.outputs?.[sourceOutputIndex];
                if (sourceOutput && isTemperatureProduct(sourceOutput.product_id)) {
                  secondInputTemp = sourceOutput.temperature || DEFAULT_BOILER_INPUT_TEMPERATURE;
                }
              }
            } else {
              secondInputTemp = DEFAULT_BOILER_INPUT_TEMPERATURE;
            }
          } else {
            // Additive (geothermal): get temperature from first input
            if (connectedEdges.length > 0) {
              const firstInputEdge = connectedEdges[0];
              const sourceNode = updatedNodes.find(n => n.id === firstInputEdge.source);
              if (sourceNode) {
                const sourceOutputIndex = parseInt(firstInputEdge.sourceHandle.split('-')[1]);
                const sourceOutput = sourceNode.data?.recipe?.outputs?.[sourceOutputIndex];
                if (sourceOutput && isTemperatureProduct(sourceOutput.product_id)) {
                  inputTemp = sourceOutput.temperature || DEFAULT_WATER_TEMPERATURE;
                }
              }
            }
          }
          
          // Recalculate this node's output temperature
          const newTemp = calculateOutputTemperature(
            machine.id,
            targetNode.data.recipe.temperatureSettings || {},
            inputTemp,
            null,
            secondInputTemp
          );
          
          // Check if temperature actually changed
          const currentTemp = targetNode.data.recipe.outputs.find(o => 
            isTemperatureProduct(o.product_id) && o.temperature !== undefined
          )?.temperature;
          
          if (currentTemp !== undefined && Math.abs(newTemp - currentTemp) < 0.01) {
            return targetNode;
          }
          
          // Temperature changed - update and flag for another iteration
          hasChanges = true;
          
          // Apply temperature to outputs using unified logic
          // Pass through input temp for non-boiler machines, first input temp for boilers
          const updatedOutputs = applyTemperatureToOutputs(
            targetNode.data.recipe.outputs,
            newTemp,
            isBoiler,
            heatSource,
            inputTemp
          );
          
          return {
            ...targetNode,
            data: {
              ...targetNode.data,
              recipe: {
                ...targetNode.data.recipe,
                outputs: updatedOutputs
              }
            }
          };
        });
      }
      
      return updatedNodes;
    });
  }, [setNodes]);

  // Validate edge connections by product ID
  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    if (!sourceNode || !targetNode) return;

    const sourceProductId = sourceNode.data.recipe.outputs[parseInt(params.sourceHandle.split('-')[1])]?.product_id;
    const targetProductId = targetNode.data.recipe.inputs[parseInt(params.targetHandle.split('-')[1])]?.product_id;
    if (sourceProductId !== targetProductId) return;

    setEdges((eds) => {
      const newEdges = addEdge({ ...params, type: 'custom', animated: false }, eds);
      // Recalculate temperatures after connection is made
      setTimeout(() => recalculateAllTemperatures(nodes, newEdges), 0);
      return newEdges;
    });
  }, [setEdges, nodes, recalculateAllTemperatures]);

  // Reset recipe selector to initial state
  const resetSelector = () => {
    setShowRecipeSelector(false);
    setSelectedProduct(null);
    setSelectedMachine(null);
    setSelectorMode('product');
    setSearchTerm('');
    setSortBy('name_asc');
    setFilterType('all');
    setRecipeFilter('all');
    setAutoConnectTarget(null);
    setSelectorOpenedFrom('button');
  };

  // Open recipe selector from main button
  const openRecipeSelector = useCallback(() => {
    setShowRecipeSelector(true);
    setAutoConnectTarget(null);
    setSelectorOpenedFrom('button');
  }, []);

  // Open recipe selector for product input
  const openRecipeSelectorForInput = useCallback((productId, nodeId, inputIndex) => {
    const product = getProduct(productId);
    if (product) {
      setShowRecipeSelector(true);
      setSelectedProduct(product);
      setAutoConnectTarget({ nodeId, inputIndex, productId });
      setSelectorOpenedFrom('rectangle');
      setRecipeFilter('producers');
    }
  }, []);

  // Open recipe selector for product output
  const openRecipeSelectorForOutput = useCallback((productId, nodeId, outputIndex) => {
    const product = getProduct(productId);
    if (product) {
      setShowRecipeSelector(true);
      setSelectedProduct(product);
      setAutoConnectTarget({ nodeId, outputIndex, productId, isOutput: true });
      setSelectorOpenedFrom('rectangle');
      setRecipeFilter('consumers');
    }
  }, []);

  // Update drill node inputs/outputs and power metrics
  const handleDrillSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    const metrics = settings.drillHead && settings.depth 
      ? calculateDrillMetrics(settings.drillHead, settings.consumable, settings.machineOil, settings.depth) 
      : null;
    
    updateNodeData(nodeId, data => ({
      ...data,
      recipe: {
        ...data.recipe,
        inputs: inputs.length > 0 ? inputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
        outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
        drillSettings: settings,
        cycle_time: 1,
        power_consumption: metrics 
          ? { 
              max: metrics.drillingPower * 1000000, 
              average: ((metrics.drillingPower * metrics.lifeTime + metrics.idlePower * (metrics.replacementTime + metrics.travelTime)) / metrics.totalCycleTime) * 1000000
            } 
          : 'Variable',
        pollution: metrics ? metrics.pollution : 'Variable',
      },
      leftHandles: Math.max(inputs.length, 1),
      rightHandles: Math.max(outputs.length, 1),
    }));

    // Remove edges connected to deleted slots
    setEdges((eds) => eds.filter(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        const handleIndex = parseInt((edge.source === nodeId ? edge.sourceHandle : edge.targetHandle).split('-')[1]);
        return edge.source === nodeId ? handleIndex < outputs.length : handleIndex < inputs.length;
      }
      return true;
    }));
  }, [setEdges]);

  // Update logic assembler node inputs/outputs and power metrics
  const handleLogicAssemblerSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    const getTargetMicrochip = () => {
      if (!settings.outerStage || !settings.innerStage) return '';
      return settings.outerStage === 1 
        ? `p_${settings.innerStage}x_microchip` 
        : `p_${settings.outerStage}x${settings.innerStage}x_microchip`;
    };
    
    const targetMicrochip = getTargetMicrochip();
    const metrics = targetMicrochip 
      ? calculateLogicAssemblerMetrics(targetMicrochip, settings.machineOil, settings.tickCircuitDelay) 
      : null;

    updateNodeData(nodeId, data => ({
      ...data,
      recipe: {
        ...data.recipe,
        inputs: inputs.length > 0 
          ? inputs 
          : [
              { product_id: 'p_logic_plate', quantity: 'Variable' },
              { product_id: 'p_copper_wire', quantity: 'Variable' },
              { product_id: 'p_semiconductor', quantity: 'Variable' },
              { product_id: 'p_gold_wire', quantity: 'Variable' },
            ],
        outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
        assemblerSettings: settings,
        cycle_time: metrics ? metrics.cycleTime : 'Variable',
        power_consumption: metrics 
          ? { max: metrics.maxPowerConsumption, average: metrics.avgPowerConsumption } 
          : 'Variable',
      },
      leftHandles: Math.max(inputs.length, 1),
      rightHandles: Math.max(outputs.length, 1),
    }));

    // Remove edges connected to deleted slots
    setEdges((eds) => eds.filter(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        const handleIndex = parseInt((edge.source === nodeId ? edge.sourceHandle : edge.targetHandle).split('-')[1]);
        return edge.source === nodeId ? handleIndex < outputs.length : handleIndex < inputs.length;
      }
      return true;
    }));
  }, [setEdges]);

  // Update temperature settings for machines that produce heated water/steam
  const handleTemperatureSettingsChange = useCallback((nodeId, settings, outputs, powerConsumption) => {
    updateNodeData(nodeId, data => ({
      ...data,
      recipe: {
        ...data.recipe,
        outputs: outputs,
        temperatureSettings: settings,
        power_consumption: powerConsumption !== null && powerConsumption !== undefined 
          ? powerConsumption 
          : data.recipe.power_consumption
      }
    }));
    
    // Recalculate downstream temperatures after updating this node
    setTimeout(() => {
      setNodes(currentNodes => {
        setEdges(currentEdges => {
          recalculateAllTemperatures(currentNodes, currentEdges);
          return currentEdges;
        });
        return currentNodes;
      });
    }, 0);
  }, [setNodes, setEdges, recalculateAllTemperatures]);

  // Update boiler settings (heat loss)
  const handleBoilerSettingsChange = useCallback((nodeId, settings) => {
    updateNodeData(nodeId, data => {
      const machine = getMachine(data.recipe.machine_id);
      const heatSource = HEAT_SOURCES[machine?.id];
      
      if (!heatSource || heatSource.type !== 'boiler') return data;
      
      // Calculate new output temperature with updated heat loss
      const outputTemp = calculateOutputTemperature(
        machine.id,
        settings,
        DEFAULT_BOILER_INPUT_TEMPERATURE,
        null,
        DEFAULT_BOILER_INPUT_TEMPERATURE
      );
      
      // Apply temperature to outputs using unified logic
      // For initial settings, use default input temp
      const updatedOutputs = applyTemperatureToOutputs(
        data.recipe.outputs,
        outputTemp,
        true,
        heatSource,
        DEFAULT_BOILER_INPUT_TEMPERATURE
      );
      
      return {
        ...data,
        recipe: {
          ...data.recipe,
          outputs: updatedOutputs,
          temperatureSettings: settings
        }
      };
    });
    
    // Recalculate downstream temperatures after updating this node
    setTimeout(() => {
      setNodes(currentNodes => {
        setEdges(currentEdges => {
          recalculateAllTemperatures(currentNodes, currentEdges);
          return currentEdges;
        });
        return currentNodes;
      });
    }, 0);
  }, [setNodes, setEdges, recalculateAllTemperatures]);

  // Create a new recipe box on canvas
  const createRecipeBox = useCallback((recipe) => {
    const machine = getMachine(recipe.machine_id);
    if (!machine || !recipe.inputs || !recipe.outputs) {
      alert('Error: Invalid machine or recipe data');
      return;
    }

    // Initialize temperature data for heat source machines
    const recipeWithTemp = initializeRecipeTemperatures(recipe, machine.id);

    const newNodeId = `node-${nodeId}`;
    const targetNode = autoConnectTarget ? nodes.find(n => n.id === autoConnectTarget.nodeId) : null;
    const position = targetNode 
      ? { 
          x: targetNode.position.x + (autoConnectTarget.isOutput ? 400 : -400), 
          y: targetNode.position.y 
        }
      : { 
          x: Math.random() * 400 + 100, 
          y: Math.random() * 300 + 100 
        };

    const newNode = {
      id: newNodeId,
      type: 'custom',
      position,
      data: {
        recipe: recipeWithTemp,
        machine,
        machineCount: 0,
        displayMode: displayMode,
        machineDisplayMode: machineDisplayMode,
        leftHandles: recipeWithTemp.inputs.length,
        rightHandles: recipeWithTemp.outputs.length,
        onInputClick: openRecipeSelectorForInput,
        onOutputClick: openRecipeSelectorForOutput,
        onDrillSettingsChange: handleDrillSettingsChange,
        onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange,
        onTemperatureSettingsChange: handleTemperatureSettingsChange,
        onBoilerSettingsChange: handleBoilerSettingsChange,
        isTarget: false,
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    };

    setNodes((nds) => {
      const updatedNodes = [...nds, newNode];
      
      // Auto-connect edge if opened from input/output click
      if (autoConnectTarget) {
        setTimeout(() => {
          const searchKey = autoConnectTarget.isOutput ? 'inputs' : 'outputs';
          const index = recipeWithTemp[searchKey].findIndex(item => item.product_id === autoConnectTarget.productId);

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
            };
            
            setEdges((eds) => {
              const updatedEdges = addEdge(newEdge, eds);
              // Recalculate temperatures after auto-connecting
              setTimeout(() => recalculateAllTemperatures(updatedNodes, updatedEdges), 0);
              return updatedEdges;
            });
          }
        }, 50);
      }
      
      return updatedNodes;
    });

    setNodeId((id) => id + 1);
    resetSelector();
  }, [nodeId, nodes, setNodes, setEdges, openRecipeSelectorForInput, openRecipeSelectorForOutput, handleDrillSettingsChange, handleLogicAssemblerSettingsChange, handleTemperatureSettingsChange, handleBoilerSettingsChange, autoConnectTarget, displayMode, machineDisplayMode, recalculateAllTemperatures]);

  // Delete recipe box and its associated target
  const deleteRecipeBoxAndTarget = useCallback((boxId) => {
    setNodes((nds) => nds.filter((n) => n.id !== boxId));
    setEdges((eds) => eds.filter((e) => e.source !== boxId && e.target !== boxId));
    setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== boxId));
  }, [setNodes, setEdges]);

  // Toggle target status on a recipe box
  const toggleTargetStatus = useCallback((node) => {
    const existingTarget = targetProducts.find(t => t.recipeBoxId === node.id);
    if (existingTarget) {
      setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== node.id));
      updateNodeData(node.id, data => ({ ...data, isTarget: false }));
    } else if (node.data?.recipe?.outputs?.length > 0) {
      setTargetProducts(prev => [...prev, { 
        id: `target_${targetIdCounter}`, 
        recipeBoxId: node.id, 
        productId: node.data.recipe.outputs[0].product_id, 
        desiredAmount: 0 
      }]);
      setTargetIdCounter(prev => prev + 1);
      updateNodeData(node.id, data => ({ ...data, isTarget: true }));
    }
  }, [targetProducts, targetIdCounter]);

  // Node interactions
  const onNodeClick = useCallback((event, node) => {
    if (event.shiftKey && !event.ctrlKey && !event.altKey) {
      toggleTargetStatus(node);
    } else if (event.ctrlKey && event.altKey) {
      deleteRecipeBoxAndTarget(node.id);
    }
  }, [toggleTargetStatus, deleteRecipeBoxAndTarget]);

  // Double-click to edit machine count
  const onNodeDoubleClick = useCallback((event, node) => {
    event.stopPropagation();
    setEditingNodeId(node.id);
    setEditingMachineCount(String(node.data?.machineCount ?? 0));
    setShowMachineCountEditor(true);
  }, []);

  // Update machine count for a node
  const handleMachineCountUpdate = useCallback(() => {
    const value = parseFloat(editingMachineCount);
    
    if (isNaN(value) || value < 0) {
      alert('Machine count must be a non-negative number');
      return;
    }

    updateNodeData(editingNodeId, data => ({
      ...data,
      machineCount: value
    }));

    setShowMachineCountEditor(false);
    setEditingNodeId(null);
    setEditingMachineCount('');
  }, [editingNodeId, editingMachineCount]);

  // Compute machines
  const handleCompute = useCallback(() => {
    alert('Computation to come soon!');
  }, []);

  // Handle extended panel toggle with animation
  const handleExtendedPanelToggle = useCallback(() => {
    if (extendedPanelOpen) {
      setExtendedPanelClosing(true);
      setTimeout(() => {
        setExtendedPanelOpen(false);
        setExtendedPanelClosing(false);
      }, 300);
    } else {
      setExtendedPanelOpen(true);
    }
  }, [extendedPanelOpen]);

  // Get filtered recipe list based on selected product
  const getAvailableRecipes = () => {
    if (!selectedProduct) return [];
    
    const producers = getRecipesProducingProductFiltered(selectedProduct.id);
    const consumers = getRecipesUsingProduct(selectedProduct.id);
    const isDrillInput = canDrillUseProduct(selectedProduct.id);
    const isDrillOutput = Object.values(DEPTH_OUTPUTS).some(outputs => outputs.some(o => o.product_id === selectedProduct.id));
    const isAssemblerInput = ['p_logic_plate', 'p_copper_wire', 'p_semiconductor', 'p_gold_wire', 'p_machine_oil'].includes(selectedProduct.id);
    const isAssemblerOutput = MICROCHIP_STAGES.some(stage => stage.productId === selectedProduct.id);

    if (recipeFilter === 'producers') {
      const drillRecipes = isDrillOutput ? [DEFAULT_DRILL_RECIPE] : [];
      const assemblerRecipes = isAssemblerOutput ? [DEFAULT_LOGIC_ASSEMBLER_RECIPE] : [];
      return [...producers, ...drillRecipes, ...assemblerRecipes];
    }
    
    if (recipeFilter === 'consumers') {
      const drillRecipes = isDrillInput ? [DEFAULT_DRILL_RECIPE] : [];
      const assemblerRecipes = isAssemblerInput ? [DEFAULT_LOGIC_ASSEMBLER_RECIPE] : [];
      return [...consumers, ...drillRecipes, ...assemblerRecipes];
    }
    
    const drillRecipes = (isDrillInput || isDrillOutput) ? [DEFAULT_DRILL_RECIPE] : [];
    const assemblerRecipes = (isAssemblerInput || isAssemblerOutput) ? [DEFAULT_LOGIC_ASSEMBLER_RECIPE] : [];
    return Array.from(new Map([...producers, ...consumers, ...drillRecipes, ...assemblerRecipes].map(r => [r.id, r])).values());
  };

  // Trigger file input for import
  const handleImport = useCallback(() => fileInputRef.current?.click(), []);

  // Process JSON import
  const processImport = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        
        // Merge products
        const productMap = new Map((imported.products || []).map(p => [p.id, p]));
        const uniqueProducts = Array.from(productMap.values());
        const machineIds = new Set(imported.machines?.map(m => m.id) || []);
        const cleanedRecipes = (imported.recipes || []).filter(r => machineIds.has(r.machine_id));

        const currentProducts = [...products];
        uniqueProducts.forEach(newProduct => {
          const existingIndex = currentProducts.findIndex(p => p.id === newProduct.id);
          existingIndex >= 0 
            ? (currentProducts[existingIndex] = newProduct) 
            : currentProducts.push(newProduct);
        });
        updateProducts(currentProducts);

        // Update machines and recipes
        if (imported.machines?.length > 0) {
          const currentMachines = [...machines];
          const importedMachineIdSet = new Set(imported.machines.map(m => m.id));
          const recipesWithoutImportedMachines = recipes.filter(r => !importedMachineIdSet.has(r.machine_id));
          
          imported.machines.forEach(newMachine => {
            const existingIndex = currentMachines.findIndex(m => m.id === newMachine.id);
            existingIndex >= 0 
              ? (currentMachines[existingIndex] = newMachine) 
              : currentMachines.push(newMachine);
          });
          updateMachines(currentMachines);
          updateRecipes([...recipesWithoutImportedMachines, ...cleanedRecipes]);
        }

        // Import canvas layout
        if (imported.canvas && window.confirm('Clear current canvas and load imported layout?')) {
          const restoredNodes = (imported.canvas.nodes || []).map(node => ({
            ...node,
            data: { 
              ...node.data,
              machineCount: node.data.machineCount ?? 0,
              displayMode: displayMode,
              machineDisplayMode: machineDisplayMode,
              onInputClick: openRecipeSelectorForInput, 
              onOutputClick: openRecipeSelectorForOutput, 
              onDrillSettingsChange: handleDrillSettingsChange, 
              onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange,
              onTemperatureSettingsChange: handleTemperatureSettingsChange,
              onBoilerSettingsChange: handleBoilerSettingsChange
            }
          }));
          setNodes(restoredNodes);
          setEdges(imported.canvas.edges || []);
          setTargetProducts(imported.canvas.targetProducts || []);
          setSoldProducts(imported.canvas.soldProducts || {});
          setNodeId(imported.canvas.nodeId || 0);
          setTargetIdCounter(imported.canvas.targetIdCounter || 0);
        }
        
        alert('Import successful!');
        window.location.reload();
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [setNodes, setEdges, openRecipeSelectorForInput, openRecipeSelectorForOutput, handleDrillSettingsChange, handleLogicAssemblerSettingsChange, handleTemperatureSettingsChange, handleBoilerSettingsChange, displayMode, machineDisplayMode]);

  // Export canvas to JSON
  const handleExport = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify(
        { 
          products, 
          machines, 
          recipes, 
          canvas: { nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts } 
        }, 
        null, 
        2
      )], 
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `industrialist-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts]);

  // Reset to default game data
  const handleRestoreDefaults = useCallback(() => {
    if (window.confirm('Restore all data to defaults? This will clear the canvas and reset all products, machines, and recipes.')) {
      restoreDefaults();
      setNodes([]);
      setEdges([]);
      setNodeId(0);
      setTargetProducts([]);
      setTargetIdCounter(0);
      setSoldProducts({});
      window.location.reload();
    }
  }, [setNodes, setEdges]);

  // Filter and sort products for selector
  const filteredProducts = products
    .filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
      (filterType === 'all' || p.type === filterType)
    )
    .sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'price_asc') return (a.price === 'Variable' ? Infinity : a.price) - (b.price === 'Variable' ? Infinity : b.price);
      if (sortBy === 'price_desc') return (b.price === 'Variable' ? -Infinity : b.price) - (a.price === 'Variable' ? -Infinity : a.price);
      if (sortBy === 'rp_asc') return (a.rp_multiplier === 'Variable' ? Infinity : a.rp_multiplier) - (b.rp_multiplier === 'Variable' ? Infinity : b.rp_multiplier);
      return (b.rp_multiplier === 'Variable' ? -Infinity : b.rp_multiplier) - (a.rp_multiplier === 'Variable' ? -Infinity : a.rp_multiplier);
    });

  // Filter machines
  const filteredMachines = machines
    .filter(m => 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
      (m.id === 'm_mineshaft_drill' || m.id === 'm_logic_assembler' || getRecipesForMachine(m.id).length > 0)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // Handle machine selection
  const handleMachineSelect = (machine) => {
    if (machine.id === 'm_mineshaft_drill') createRecipeBox(DEFAULT_DRILL_RECIPE);
    else if (machine.id === 'm_logic_assembler') createRecipeBox(DEFAULT_LOGIC_ASSEMBLER_RECIPE);
    else setSelectedMachine(machine);
  };

  const availableRecipes = selectorMode === 'product' 
    ? getAvailableRecipes() 
    : getRecipesForMachine(selectedMachine?.id);

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
        nodeTypes={nodeTypes} 
        edgeTypes={edgeTypes} 
        fitView
      >
        <Background color="#333" gap={16} size={1} />
        <Controls className={(extendedPanelOpen || extendedPanelClosing) && !leftPanelCollapsed ? 'controls-shifted' : ''} />
        <MiniMap 
          nodeColor={(node) => {
            return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim();
          }}
          maskColor={getComputedStyle(document.documentElement).getPropertyValue('--bg-overlay').trim()}
        />
        
        {/* Stats Panel and Action Buttons - Left Side */}
        <Panel position="top-left" style={{ margin: '10px' }}>
          <div className={`left-panel-container ${leftPanelCollapsed ? 'collapsed' : ''}`}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                {/* Stats Panel */}
                <div className="stats-panel">
                  <h3 className="stats-title">{statisticsTitle}</h3>
                  <div className="stats-grid">
                    <div className="stat-item">
                      <div className="stat-label">Total Power:</div>
                      <div className="stat-value">{formatPowerDisplay(stats.totalPower)}</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">Total Pollution:</div>
                      <div className="stat-value">{stats.totalPollution.toFixed(2)}%/hr</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">Total Minimum Model Count:</div>
                      <div className="stat-value">{stats.totalModelCount.toFixed(0)}</div>
                    </div>
                    <div className="stat-item">
                      <div className="stat-label">Total Profit:</div>
                      <div className="stat-value" style={{ color: totalProfit >= 0 ? '#86efac' : '#fca5a5' }}>
                        ${metricFormat(totalProfit)}/s
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex-col action-buttons-container">
                  <button onClick={openRecipeSelector} className="btn btn-primary">
                    + Select Recipe
                  </button>
                  <button onClick={() => setShowTargetsModal(true)} className="btn btn-secondary">
                    View Targets ({targetProducts.length})
                  </button>
                  <button onClick={handleCompute} className="btn btn-secondary">
                    Compute Machines
                  </button>
                  
                  {/* Extended Panel and Collapse Toggle Buttons */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      onClick={() => setExtendedPanelOpen(!extendedPanelOpen)} 
                      className="btn btn-secondary btn-square"
                      title={extendedPanelOpen ? "Close more statistics" : "Open more statistics"}
                    >
                      {extendedPanelOpen ? '↓' : '↑'}
                    </button>
                    <button 
                      onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)} 
                      className="btn btn-secondary btn-square btn-panel-toggle"
                      title={leftPanelCollapsed ? "Show left panel" : "Hide left panel"}
                    >
                      {leftPanelCollapsed ? '→' : '←'}
                    </button>
                  </div>
                </div>
              </div>
              
              {/* More Statistics Panel */}
              {(extendedPanelOpen || extendedPanelClosing) && (
                <div className={`extended-panel ${extendedPanelClosing ? 'closing' : ''}`}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '15px',
                    borderBottom: '2px solid var(--border-divider)',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--bg-secondary)',
                    zIndex: 1
                  }}>
                    <h3 style={{
                      color: 'var(--color-primary)',
                      fontSize: 'var(--font-size-md)',
                      fontWeight: 700,
                      margin: 0
                    }}>
                      More Statistics
                    </h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={() => setDisplayMode(prev => prev === 'perSecond' ? 'perCycle' : 'perSecond')}
                        className="btn btn-secondary"
                        style={{
                          padding: '8px 16px',
                          fontSize: 'var(--font-size-base)',
                          minWidth: 'auto'
                        }}
                        title={displayMode === 'perSecond' ? 'Switch to per-cycle display' : 'Switch to per-second display'}
                      >
                        {displayMode === 'perSecond' ? 'Per Second' : 'Per Cycle'}
                      </button>
                      <button 
                        onClick={() => setMachineDisplayMode(prev => prev === 'perMachine' ? 'total' : 'perMachine')}
                        className="btn btn-secondary"
                        style={{
                          padding: '8px 16px',
                          fontSize: 'var(--font-size-base)',
                          minWidth: 'auto'
                        }}
                        title={machineDisplayMode === 'perMachine' ? 'Switch to total display' : 'Switch to per-machine display'}
                      >
                        {machineDisplayMode === 'perMachine' ? 'Per Machine' : 'Total'}
                      </button>
                    </div>
                  </div>
                  <div className="extended-panel-content" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', paddingBottom: '120px' }}>
                    {/* Global Pollution Input */}
                    <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label 
                        htmlFor="global-pollution" 
                        style={{ 
                          color: 'var(--text-primary)', 
                          fontSize: 'var(--font-size-base)', 
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        Global Pollution (%):
                      </label>
                      <input 
                        id="global-pollution"
                        type="text" 
                        value={globalPollution} 
                        onFocus={() => setPollutionInputFocused(true)}
                        onBlur={(e) => {
                          setPollutionInputFocused(false);
                          const val = e.target.value;
                          const num = parseFloat(val);
                          if (!isNaN(num) && isFinite(num)) {
                            setGlobalPollution(parseFloat(num.toFixed(4)));
                          } else {
                            setGlobalPollution(0);
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGlobalPollution(val);
                        }}
                        className="input"
                        placeholder="Enter global pollution"
                        style={{ 
                          flex: 1,
                          textAlign: 'left'
                        }}
                      />
                    </div>

                    {/* Excess Products Table */}
                    <div style={{ marginTop: '30px' }}>
                      <h4 style={{ 
                        color: 'var(--text-primary)', 
                        fontSize: 'var(--font-size-base)', 
                        fontWeight: 600,
                        marginBottom: '12px'
                      }}>
                        Excess Products:
                      </h4>
                      {excessProducts.length === 0 ? (
                        <div style={{ 
                          color: 'var(--text-secondary)', 
                          fontSize: 'var(--font-size-sm)',
                          padding: '15px',
                          textAlign: 'center',
                          background: 'var(--bg-main)',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          No excess products. All outputs are consumed by connected inputs.
                        </div>
                      ) : (
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '8px' 
                        }}>
                          {excessProducts.map(item => (
                            <div 
                              key={item.productId}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 12px',
                                background: 'var(--bg-main)',
                                borderRadius: 'var(--radius-sm)',
                                border: item.isSold ? '2px solid var(--color-primary)' : '2px solid var(--border-light)'
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ 
                                  color: 'var(--text-primary)', 
                                  fontSize: 'var(--font-size-sm)',
                                  fontWeight: 600 
                                }}>
                                  {item.product.name}
                                </div>
                                <div style={{ 
                                  color: 'var(--text-secondary)', 
                                  fontSize: 'var(--font-size-xs)',
                                  marginTop: '2px'
                                }}>
                                  {metricFormat(item.excessRate)}/s
                                </div>
                              </div>
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px' 
                              }}>
                                {typeof item.product.price === 'number' && (
                                  <div style={{ 
                                    color: item.isSold ? 'var(--color-primary)' : 'var(--text-muted)',
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: 600
                                  }}>
                                    ${metricFormat(item.product.price * item.excessRate)}/s
                                  </div>
                                )}
                                <label style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '6px',
                                  cursor: 'pointer',
                                  color: 'var(--text-primary)',
                                  fontSize: 'var(--font-size-sm)'
                                }}>
                                  <input 
                                    type="checkbox"
                                    checked={item.isSold}
                                    onChange={(e) => {
                                      setSoldProducts(prev => ({
                                        ...prev,
                                        [item.productId]: e.target.checked
                                      }));
                                    }}
                                    style={{
                                      width: '18px',
                                      height: '18px',
                                      cursor: 'pointer',
                                      accentColor: 'var(--color-primary)'
                                    }}
                                  />
                                  Sell
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Deficient Products Table */}
                    <div style={{ marginTop: '30px' }}>
                      <h4 style={{ 
                        color: 'var(--text-primary)', 
                        fontSize: 'var(--font-size-base)', 
                        fontWeight: 600,
                        marginBottom: '12px'
                      }}>
                        Deficient Products:
                      </h4>
                      {deficientProducts.length === 0 ? (
                        <div style={{ 
                          color: 'var(--text-secondary)', 
                          fontSize: 'var(--font-size-sm)',
                          padding: '15px',
                          textAlign: 'center',
                          background: 'var(--bg-main)',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          No deficient products. All inputs are fully supplied by connected outputs.
                        </div>
                      ) : (
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '8px' 
                        }}>
                          {deficientProducts.map(item => (
                            <div 
                              key={item.productId}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 12px',
                                background: 'var(--bg-main)',
                                borderRadius: 'var(--radius-sm)',
                                border: '2px solid #fca5a5'
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ 
                                  color: 'var(--text-primary)', 
                                  fontSize: 'var(--font-size-sm)',
                                  fontWeight: 600 
                                }}>
                                  {item.product.name}
                                </div>
                                <div style={{ 
                                  color: '#fca5a5', 
                                  fontSize: 'var(--font-size-xs)',
                                  marginTop: '2px'
                                }}>
                                  Shortage: {metricFormat(item.deficiencyRate)}/s
                                </div>
                              </div>
                              <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px' 
                              }}>
                                <div style={{ 
                                  color: '#fca5a5',
                                  fontSize: 'var(--font-size-xs)',
                                  fontWeight: 600,
                                  textAlign: 'right'
                                }}>
                                  {item.affectedNodes.length} node{item.affectedNodes.length !== 1 ? 's' : ''} affected
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Machine Costs Table */}
                    <div style={{ marginTop: '30px' }}>
                      <h4 style={{ 
                        color: 'var(--text-primary)', 
                        fontSize: 'var(--font-size-base)', 
                        fontWeight: 600,
                        marginBottom: '12px'
                      }}>
                        Machine Costs:
                      </h4>
                      {machineStats.stats.length === 0 ? (
                        <div style={{ 
                          color: 'var(--text-secondary)', 
                          fontSize: 'var(--font-size-sm)',
                          padding: '15px',
                          textAlign: 'center',
                          background: 'var(--bg-main)',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          No machines on canvas.
                        </div>
                      ) : (
                        <>
                          <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '8px',
                            marginBottom: '15px'
                          }}>
                            {machineStats.stats.map(stat => (
                              <div 
                                key={stat.machineId}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '10px 12px',
                                  background: 'var(--bg-main)',
                                  borderRadius: 'var(--radius-sm)',
                                  border: '2px solid var(--border-light)'
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <div style={{ 
                                    color: 'var(--text-primary)', 
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: 600 
                                  }}>
                                    {stat.machine.name}
                                  </div>
                                  <div style={{ 
                                    color: 'var(--text-secondary)', 
                                    fontSize: 'var(--font-size-xs)',
                                    marginTop: '2px'
                                  }}>
                                    Count: {stat.count} × ${metricFormat(stat.cost)}
                                  </div>
                                </div>
                                <div style={{ 
                                  color: 'var(--color-primary)',
                                  fontSize: 'var(--font-size-sm)',
                                  fontWeight: 600
                                }}>
                                  ${metricFormat(stat.totalCost)}
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {/* Total Cost */}
                          <div style={{
                            padding: '12px',
                            background: 'var(--bg-main)',
                            borderRadius: 'var(--radius-sm)',
                            border: '2px solid var(--color-primary)'
                          }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: '8px'
                            }}>
                              <div style={{ 
                                color: 'var(--text-primary)', 
                                fontSize: 'var(--font-size-base)',
                                fontWeight: 700 
                              }}>
                                Total Cost:
                              </div>
                              <div style={{ 
                                color: 'var(--color-primary)',
                                fontSize: 'var(--font-size-md)',
                                fontWeight: 700
                              }}>
                                ${metricFormat(machineStats.totalCost)}
                              </div>
                            </div>
                            <div style={{ 
                              color: 'var(--text-muted)', 
                              fontSize: 'var(--font-size-xs)',
                              fontStyle: 'italic',
                              textAlign: 'center'
                            }}>
                              For machines only. Poles and pipes not accounted for.
                            </div>
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

        {/* Menu - Right Side */}
        <Panel position="top-right" style={{ margin: '10px' }}>
          <div className={`menu-container ${menuOpen ? '' : 'closed'}`}>
            <button 
              onClick={() => setMenuOpen(!menuOpen)} 
              className="btn btn-secondary btn-menu-toggle"
            >
              {menuOpen ? '>' : '<'}
            </button>
            <div className="menu-buttons">
              <button 
                onClick={() => { setNodes([]); setEdges([]); setNodeId(0); setTargetProducts([]); setTargetIdCounter(0); setSoldProducts({}); }} 
                className="btn btn-secondary"
              >
                Clear All
              </button>
              <button onClick={handleImport} className="btn btn-secondary">
                Import JSON
              </button>
              <button onClick={handleExport} className="btn btn-secondary">
                Export JSON
              </button>
              <button onClick={handleRestoreDefaults} className="btn btn-secondary">
                Restore Defaults
              </button>
              <button 
                onClick={() => setShowThemeEditor(true)}
                className="btn btn-secondary"
              >
                Theme Editor
              </button>
            </div>
          </div>
        </Panel>
      </ReactFlow>

      <input 
        ref={fileInputRef} 
        type="file" 
        accept=".json" 
        style={{ display: 'none' }} 
        onChange={processImport} 
      />

      {/* Machine Count Editor Modal */}
      {showMachineCountEditor && (
        <div className="modal-overlay" onClick={() => setShowMachineCountEditor(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
            <h2 className="modal-title">Edit Machine Count</h2>
            <div style={{ marginBottom: '20px' }}>
              <label 
                style={{ 
                  display: 'block',
                  color: 'var(--text-primary)', 
                  fontSize: 'var(--font-size-base)', 
                  fontWeight: 600,
                  marginBottom: '10px'
                }}
              >
                Machine Count:
              </label>
              <input 
                type="number"
                min="0"
                step="0.1"
                value={editingMachineCount}
                onChange={(e) => setEditingMachineCount(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleMachineCountUpdate();
                  }
                }}
                className="input"
                placeholder="Enter machine count"
                autoFocus
              />
              <p style={{ 
                marginTop: '8px', 
                fontSize: 'var(--font-size-sm)', 
                color: 'var(--text-secondary)' 
              }}>
                Must be a non-negative number (can be decimal)
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setShowMachineCountEditor(false)} 
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                Cancel
              </button>
              <button 
                onClick={handleMachineCountUpdate} 
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recipe Selector Modal */}
      {showRecipeSelector && (
        <div className="modal-overlay" onClick={resetSelector}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              {selectedProduct 
                ? `Recipes for ${selectedProduct.name}` 
                : selectedMachine 
                  ? `Recipes for ${selectedMachine.name}` 
                  : 'Select Product or Machine'}
            </h2>

            {!selectedProduct && !selectedMachine ? (
              <>
                <div className="mb-lg">
                  <div className="flex-row" style={{ gap: '10px', marginBottom: '15px' }}>
                    <button 
                      onClick={() => setSelectorMode('product')} 
                      className={`btn ${selectorMode === 'product' ? 'btn-primary' : 'btn-secondary'}`} 
                      style={{ flex: 1 }}
                    >
                      By Products
                    </button>
                    <button 
                      onClick={() => setSelectorMode('machine')} 
                      className={`btn ${selectorMode === 'machine' ? 'btn-primary' : 'btn-secondary'}`} 
                      style={{ flex: 1 }}
                    >
                      By Machines
                    </button>
                  </div>
                </div>

                {selectorMode === 'product' ? (
                  <>
                    <div className="mb-lg flex-col">
                      <input 
                        type="text" 
                        placeholder="Search products..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="input" 
                      />
                      <div className="flex-row">
                        <select 
                          value={filterType} 
                          onChange={(e) => setFilterType(e.target.value)} 
                          className="select"
                        >
                          <option value="all">All Types</option>
                          <option value="item">Items Only</option>
                          <option value="fluid">Fluids Only</option>
                        </select>
                        <select 
                          value={sortBy} 
                          onChange={(e) => setSortBy(e.target.value)} 
                          className="select"
                        >
                          <option value="name_asc">Name ↑ (A-Z)</option>
                          <option value="name_desc">Name ↓ (Z-A)</option>
                          <option value="price_asc">Price ↑ (Low-High)</option>
                          <option value="price_desc">Price ↓ (High-Low)</option>
                          <option value="rp_asc">RP Mult ↑ (Low-High)</option>
                          <option value="rp_desc">RP Mult ↓ (High-Low)</option>
                        </select>
                      </div>
                    </div>
                    <div className="modal-content" style={{ maxHeight: '400px' }}>
                      <div className="product-table-header">
                        <div>Product</div>
                        <div className="text-right">Price</div>
                        <div className="text-right">RP Mult</div>
                      </div>
                      {filteredProducts.map(product => (
                        <div key={product.id} onClick={() => setSelectedProduct(product)} className="product-row">
                          <div>
                            <div className="product-name">{product.name}</div>
                            <div className="product-type">
                              {product.type === 'item' ? '📦 Item' : '💧 Fluid'}
                            </div>
                          </div>
                          <div className="text-right" style={{ alignSelf: 'center' }}>
                            {product.price === 'Variable' ? 'Variable' : `${metricFormat(product.price)}`}
                          </div>
                          <div className="text-right" style={{ alignSelf: 'center' }}>
                            {product.rp_multiplier === 'Variable' 
                              ? 'Variable' 
                              : product.rp_multiplier >= 1000 
                                ? `${metricFormat(product.rp_multiplier)}x` 
                                : `${product.rp_multiplier.toFixed(1)}x`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-lg">
                      <input 
                        type="text" 
                        placeholder="Search machines..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        className="input" 
                      />
                    </div>
                    <div className="modal-content flex-col" style={{ maxHeight: '400px' }}>
                      {filteredMachines.length === 0 ? (
                        <div className="empty-state">No machines found</div>
                      ) : (
                        filteredMachines.map(machine => (
                          <div 
                            key={machine.id} 
                            onClick={() => handleMachineSelect(machine)} 
                            className="recipe-card" 
                            style={{ cursor: 'pointer' }}
                          >
                            <div className="recipe-machine">{machine.name}</div>
                            <div className="recipe-details" style={{ color: '#999' }}>
                              {machine.id === 'm_mineshaft_drill' || machine.id === 'm_logic_assembler' 
                                ? 'Click to create box' 
                                : `${getRecipesForMachine(machine.id).length} recipe(s)`}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {selectorOpenedFrom === 'button' && (
                  <button 
                    onClick={() => { setSelectedProduct(null); setSelectedMachine(null); }} 
                    className="btn btn-secondary btn-back"
                  >
                    ← Back
                  </button>
                )}
                {selectedProduct && (
                  <div className="mb-lg">
                    <select 
                      value={recipeFilter} 
                      onChange={(e) => setRecipeFilter(e.target.value)} 
                      className="select"
                    >
                      <option value="all">All Recipes</option>
                      <option value="producers">Producers (Outputs {selectedProduct.name})</option>
                      <option value="consumers">Consumers (Uses {selectedProduct.name})</option>
                    </select>
                  </div>
                )}
                <div className="modal-content flex-col" style={{ maxHeight: '400px' }}>
                  {availableRecipes.length === 0 ? (
                    <div className="empty-state">No recipes found</div>
                  ) : (
                    availableRecipes.map(recipe => {
                      const machine = getMachine(recipe.machine_id);
                      return machine && recipe.inputs && recipe.outputs ? (
                        <div 
                          key={recipe.id} 
                          onClick={() => createRecipeBox(recipe)} 
                          className="recipe-card"
                        >
                          <div className="recipe-machine">{machine.name}</div>
                          <div className="recipe-details">
                            <span className="recipe-label-input">Inputs: </span>
                            <span>{recipe.inputs.map(input => formatIngredient(input, getProduct)).join(', ')}</span>
                          </div>
                          <div className="recipe-details">
                            <span className="recipe-label-output">Outputs: </span>
                            <span>{recipe.outputs.map(output => formatIngredient(output, getProduct)).join(', ')}</span>
                          </div>
                        </div>
                      ) : null;
                    })
                  )}
                </div>
              </>
            )}
            <button onClick={resetSelector} className="btn btn-secondary" style={{ marginTop: '20px' }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Target Products Modal */}
      {showTargetsModal && (
        <div className="modal-overlay" onClick={() => setShowTargetsModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Target Products</h2>
            <div className="modal-content flex-col" style={{ maxHeight: '500px', marginBottom: '20px' }}>
              {targetProducts.length === 0 ? (
                <div className="empty-state">
                  No target products yet. Shift+Click a recipe box to mark it as a target.
                </div>
              ) : (
                targetProducts.map(target => (
                  <div key={target.id} className="target-card">
                    <div className="flex-1">
                      <div className="target-product-name">
                        {getProductName(target.productId, getProduct)}
                      </div>
                      <div className="target-box-id">Box ID: {target.recipeBoxId}</div>
                    </div>
                    <div className="target-input-group">
                      <label className="target-label">Target:</label>
                      <input 
                        type="number" 
                        min="0" 
                        value={target.desiredAmount} 
                        onChange={(e) => setTargetProducts(prev => prev.map(t => 
                          t.id === target.id 
                            ? { ...t, desiredAmount: parseFloat(e.target.value) || 0 } 
                            : t
                        ))} 
                        className="input input-small" 
                      />
                      <span className="target-label">/s</span>
                    </div>
                    <button 
                      onClick={() => setTargetProducts(prev => prev.filter(t => t.id !== target.id))} 
                      className="btn btn-delete"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setShowTargetsModal(false)} className="btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Theme Editor Modal */}
      {showThemeEditor && (
        <ThemeEditor onClose={() => setShowThemeEditor(false)} />
      )}
    </div>
  );
}

export default App;