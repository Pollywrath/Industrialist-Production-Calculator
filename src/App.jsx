import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import CustomNode from './components/CustomNode';
import CustomEdge from './components/CustomEdge';
import { 
  products, machines, recipes, 
  getMachine, getProduct, getRecipesProducingProduct,
  updateProducts, updateMachines, updateRecipes,
  saveCanvasState, loadCanvasState, restoreDefaults
} from './data/dataLoader';
import { getProductName, formatIngredient, filterVariableProducts, formatPrice, formatRPMultiplier } from './utils/variableHandler';
import { DEFAULT_DRILL_RECIPE, DEPTH_OUTPUTS, calculateDrillMetrics } from './data/mineshaftDrill';
import { DEFAULT_LOGIC_ASSEMBLER_RECIPE, MICROCHIP_STAGES, calculateLogicAssemblerMetrics } from './data/logicAssembler';

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

// Get all recipes that use a product as input
const getRecipesUsingProduct = (productId) => {
  return recipes.filter(recipe => {
    // Exclude special machine placeholder recipes
    if (recipe.id === 'r_mineshaft_drill_01' || recipe.id === 'r_logic_assembler_01') {
      return false;
    }
    
    return recipe.inputs.some(input => 
      input.product_id === productId && input.product_id !== 'p_variableproduct'
    );
  });
};

// Get all recipes that produce a product as output
const getRecipesProducingProductFiltered = (productId) => {
  return recipes.filter(recipe => {
    // Exclude special machine placeholder recipes
    if (recipe.id === 'r_mineshaft_drill_01' || recipe.id === 'r_logic_assembler_01') {
      return false;
    }
    
    return recipe.outputs.some(output => 
      output.product_id === productId && output.product_id !== 'p_variableproduct'
    );
  });
};

// Get all recipes for a specific machine
const getRecipesForMachine = (machineId) => {
  return recipes.filter(recipe => recipe.machine_id === machineId);
};

// Check if drill recipe can use this product
const canDrillUseProduct = (productId) => {
  // Check if it's in any drill head, consumable, or machine oil
  const drillInputs = ['p_copper_drill_head', 'p_iron_drill_head', 'p_steel_drill_head', 
    'p_tungsten_carbide_drill_head', 'p_water', 'p_acetic_acid', 
    'p_hydrochloric_acid', 'p_sulfuric_acid', 'p_machine_oil'];
  
  if (drillInputs.includes(productId)) return true;
  
  // Check if it's in any depth output
  for (const outputs of Object.values(DEPTH_OUTPUTS)) {
    if (outputs.some(o => o.product_id === productId)) return true;
  }
  
  return false;
};

// Check if logic assembler can use this product
const canLogicAssemblerUseProduct = (productId) => {
  // Check if it's an input material
  const assemblerInputs = ['p_logic_plate', 'p_copper_wire', 'p_semiconductor', 'p_gold_wire', 'p_machine_oil'];
  if (assemblerInputs.includes(productId)) return true;
  
  // Check if it's any microchip output
  return MICROCHIP_STAGES.some(stage => stage.productId === productId);
};

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nodeId, setNodeId] = useState(0);
  const [showRecipeSelector, setShowRecipeSelector] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectorMode, setSelectorMode] = useState('product'); // 'product' or 'machine'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filterType, setFilterType] = useState('all');
  const [recipeFilter, setRecipeFilter] = useState('all');
  const [autoConnectTarget, setAutoConnectTarget] = useState(null);
  const [targetProducts, setTargetProducts] = useState([]);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [targetIdCounter, setTargetIdCounter] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectorOpenedFrom, setSelectorOpenedFrom] = useState('button');
  const reactFlowWrapper = useRef(null);
  const fileInputRef = useRef(null);

  // Load canvas state on mount
  useEffect(() => {
    const savedState = loadCanvasState();
    if (savedState?.nodes) {
      const restoredNodes = savedState.nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onInputClick: openRecipeSelectorForInput,
          onOutputClick: openRecipeSelectorForOutput,
          onDrillSettingsChange: handleDrillSettingsChange,
          onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange,
        }
      }));
      
      setNodes(restoredNodes);
      setEdges(savedState.edges || []);
      setTargetProducts(savedState.targetProducts || []);
      setNodeId(savedState.nodeId || 0);
      setTargetIdCounter(savedState.targetIdCounter || 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save canvas state whenever it changes
  useEffect(() => {
    saveCanvasState(nodes, edges, targetProducts, nodeId, targetIdCounter);
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter]);

  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    
    if (!sourceNode || !targetNode) return;
    
    const sourceHandleIndex = parseInt(params.sourceHandle.split('-')[1]);
    const targetHandleIndex = parseInt(params.targetHandle.split('-')[1]);
    
    const sourceProductId = sourceNode.data.recipe.outputs[sourceHandleIndex]?.product_id;
    const targetProductId = targetNode.data.recipe.inputs[targetHandleIndex]?.product_id;
    
    if (sourceProductId !== targetProductId) return;
    
    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds));
  }, [setEdges, nodes]);

  const openRecipeSelector = useCallback(() => {
    setShowRecipeSelector(true);
    setSelectedProduct(null);
    setSelectedMachine(null);
    setSelectorMode('product');
    setSearchTerm('');
    setAutoConnectTarget(null);
    setSelectorOpenedFrom('button');
    setRecipeFilter('all');
  }, []);

  const openRecipeSelectorForInput = useCallback((productId, nodeId, inputIndex) => {
    const product = getProduct(productId);
    if (product) {
      setShowRecipeSelector(true);
      setSelectedProduct(product);
      setSelectedMachine(null);
      setSelectorMode('product');
      setSearchTerm('');
      setAutoConnectTarget({ nodeId, inputIndex, productId });
      setSelectorOpenedFrom('rectangle');
      setRecipeFilter('producers');
    }
  }, []);

  const openRecipeSelectorForOutput = useCallback((productId, nodeId, outputIndex) => {
    const product = getProduct(productId);
    if (product) {
      setShowRecipeSelector(true);
      setSelectedProduct(product);
      setSelectedMachine(null);
      setSelectorMode('product');
      setSearchTerm('');
      setAutoConnectTarget({ nodeId, outputIndex, productId, isOutput: true });
      setSelectorOpenedFrom('rectangle');
      setRecipeFilter('consumers');
    }
  }, []);

  const handleDrillSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    // Calculate metrics if we have enough info
    const metrics = settings.drillHead && settings.depth 
      ? calculateDrillMetrics(settings.drillHead, settings.consumable, settings.machineOil, settings.depth)
      : null;
    
    setNodes((nds) => nds.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            recipe: {
              ...node.data.recipe,
              inputs: inputs.length > 0 ? inputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
              outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
              drillSettings: settings,
              cycle_time: 1, // Always 1 second for mineshaft drill
              power_consumption: metrics ? { 
                drilling: metrics.drillingPower * 1000000, // Convert MMF/s to MF/s
                idle: metrics.idlePower * 1000000 // Convert MMF/s to MF/s
              } : 'Variable',
              pollution: metrics ? metrics.pollution : 'Variable',
            },
            leftHandles: Math.max(inputs.length, 1),
            rightHandles: Math.max(outputs.length, 1),
          }
        };
      }
      return node;
    }));
    
    // Remove edges that are no longer valid
    setEdges((eds) => eds.filter(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return false;
        
        if (edge.source === nodeId) {
          const handleIndex = parseInt(edge.sourceHandle.split('-')[1]);
          return handleIndex < outputs.length;
        } else {
          const handleIndex = parseInt(edge.targetHandle.split('-')[1]);
          return handleIndex < inputs.length;
        }
      }
      return true;
    }));
  }, [setNodes, setEdges, nodes]);

  const handleLogicAssemblerSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    // Reconstruct targetMicrochip product ID from outer and inner stages
    const getTargetMicrochip = () => {
      if (!settings.outerStage || !settings.innerStage) return '';
      if (settings.outerStage === 1) {
        return `p_${settings.innerStage}x_microchip`;
      }
      return `p_${settings.outerStage}x${settings.innerStage}x_microchip`;
    };
    
    const targetMicrochip = getTargetMicrochip();
    
    // Calculate metrics if we have enough info
    const metrics = targetMicrochip 
      ? calculateLogicAssemblerMetrics(targetMicrochip, settings.machineOil, settings.tickCircuitDelay)
      : null;
    
    setNodes((nds) => nds.map(node => {
      if (node.id === nodeId) {
        return {
          ...node,
          data: {
            ...node.data,
            recipe: {
              ...node.data.recipe,
              inputs: inputs.length > 0 ? inputs : [
                { product_id: 'p_logic_plate', quantity: 'Variable' },
                { product_id: 'p_copper_wire', quantity: 'Variable' },
                { product_id: 'p_semiconductor', quantity: 'Variable' },
                { product_id: 'p_gold_wire', quantity: 'Variable' },
              ],
              outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
              assemblerSettings: settings,
              cycle_time: metrics ? metrics.cycleTime : 'Variable', // Total cycle time to produce 1 chip
              power_consumption: metrics ? { 
                max: metrics.maxPowerConsumption,
                average: metrics.avgPowerConsumption
              } : 'Variable',
            },
            leftHandles: Math.max(inputs.length, 1),
            rightHandles: Math.max(outputs.length, 1),
          }
        };
      }
      return node;
    }));
    
    // Remove edges that are no longer valid
    setEdges((eds) => eds.filter(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return false;
        
        if (edge.source === nodeId) {
          const handleIndex = parseInt(edge.sourceHandle.split('-')[1]);
          return handleIndex < outputs.length;
        } else {
          const handleIndex = parseInt(edge.targetHandle.split('-')[1]);
          return handleIndex < inputs.length;
        }
      }
      return true;
    }));
  }, [setNodes, setEdges, nodes]);

  const createRecipeBox = useCallback((recipe) => {
    const machine = getMachine(recipe.machine_id);
    if (!machine) {
      alert('Error: Machine not found for this recipe');
      return;
    }
    
    if (!recipe.inputs || !recipe.outputs) {
      alert('Error: Recipe is missing inputs or outputs data');
      return;
    }
    
    const newNodeId = `node-${nodeId}`;
    
    let position;
    if (autoConnectTarget) {
      const targetNode = nodes.find(n => n.id === autoConnectTarget.nodeId);
      if (targetNode) {
        const xOffset = autoConnectTarget.isOutput ? 400 : -400;
        position = { x: targetNode.position.x + xOffset, y: targetNode.position.y };
      } else {
        position = { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 };
      }
    } else {
      position = { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 };
    }

    const newNode = {
      id: newNodeId,
      type: 'custom',
      position,
      data: { 
        recipe,
        machine,
        leftHandles: recipe.inputs.length,
        rightHandles: recipe.outputs.length,
        onInputClick: openRecipeSelectorForInput,
        onOutputClick: openRecipeSelectorForOutput,
        onDrillSettingsChange: handleDrillSettingsChange,
        onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange,
        isTarget: false,
      },
      sourcePosition: 'right',
      targetPosition: 'left',
    };
    
    setNodes((nds) => [...nds, newNode]);

    // Auto-connect if opened from rectangle
    if (autoConnectTarget) {
      setTimeout(() => {
        if (autoConnectTarget.isOutput) {
          const inputIndex = recipe.inputs.findIndex(
            input => input.product_id === autoConnectTarget.productId
          );

          if (inputIndex !== -1 && autoConnectTarget.outputIndex !== undefined) {
            const newEdge = {
              source: autoConnectTarget.nodeId,
              sourceHandle: `right-${autoConnectTarget.outputIndex}`,
              target: newNodeId,
              targetHandle: `left-${inputIndex}`,
              type: 'custom',
              animated: false,
            };
            setEdges((eds) => addEdge(newEdge, eds));
          }
        } else {
          const outputIndex = recipe.outputs.findIndex(
            output => output.product_id === autoConnectTarget.productId
          );

          if (outputIndex !== -1 && autoConnectTarget.inputIndex !== undefined) {
            const newEdge = {
              source: newNodeId,
              sourceHandle: `right-${outputIndex}`,
              target: autoConnectTarget.nodeId,
              targetHandle: `left-${autoConnectTarget.inputIndex}`,
              type: 'custom',
              animated: false,
            };
            setEdges((eds) => addEdge(newEdge, eds));
          }
        }
      }, 50);
    }

    setNodeId((id) => id + 1);
    setShowRecipeSelector(false);
    setSelectedProduct(null);
    setSelectedMachine(null);
    setSelectorMode('product');
    setSearchTerm('');
    setAutoConnectTarget(null);
    setSelectorOpenedFrom('button');
    setRecipeFilter('all');
  }, [nodeId, nodes, setNodes, setEdges, openRecipeSelectorForInput, openRecipeSelectorForOutput, handleDrillSettingsChange, handleLogicAssemblerSettingsChange, autoConnectTarget]);

  const deleteRecipeBoxAndTarget = useCallback((boxId) => {
    setNodes((nds) => nds.filter((n) => n.id !== boxId));
    setEdges((eds) => eds.filter((e) => e.source !== boxId && e.target !== boxId));
    setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== boxId));
  }, [setNodes, setEdges]);

  const toggleTargetStatus = useCallback((node) => {
    const existingTarget = targetProducts.find(t => t.recipeBoxId === node.id);
    
    if (existingTarget) {
      setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== node.id));
      setNodes((nds) => nds.map(n => 
        n.id === node.id ? { ...n, data: { ...n.data, isTarget: false } } : n
      ));
    } else {
      if (node.data?.recipe?.outputs && node.data.recipe.outputs.length > 0) {
        const newTarget = {
          id: `target_${targetIdCounter}`,
          recipeBoxId: node.id,
          productId: node.data.recipe.outputs[0].product_id,
          desiredAmount: 0,
        };
        setTargetProducts(prev => [...prev, newTarget]);
        setTargetIdCounter(prev => prev + 1);
        
        setNodes((nds) => nds.map(n => 
          n.id === node.id ? { ...n, data: { ...n.data, isTarget: true } } : n
        ));
      }
    }
  }, [targetProducts, targetIdCounter, setNodes]);

  const onNodeClick = useCallback((event, node) => {
    if (event.shiftKey && !event.ctrlKey && !event.altKey) {
      toggleTargetStatus(node);
      return;
    }

    if (event.ctrlKey && event.altKey) {
      deleteRecipeBoxAndTarget(node.id);
    }
  }, [toggleTargetStatus, deleteRecipeBoxAndTarget]);

  const clearAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeId(0);
    setTargetProducts([]);
    setTargetIdCounter(0);
  }, [setNodes, setEdges]);

  const removeTargetStatus = useCallback((targetId) => {
    const target = targetProducts.find(t => t.id === targetId);
    if (target) {
      setTargetProducts(prev => prev.filter(t => t.id !== targetId));
      setNodes((nds) => nds.map(n => 
        n.id === target.recipeBoxId ? { ...n, data: { ...n.data, isTarget: false } } : n
      ));
    }
  }, [targetProducts, setNodes]);

  const updateTargetAmount = useCallback((targetId, amount) => {
    setTargetProducts(prev => prev.map(t => 
      t.id === targetId ? { ...t, desiredAmount: amount } : t
    ));
  }, []);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const processImport = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        
        const productMap = new Map();
        if (imported.products) {
          const filteredProducts = filterVariableProducts(imported.products);
          filteredProducts.forEach(p => productMap.set(p.id, p));
        }
        const uniqueProducts = Array.from(productMap.values());

        const machineIds = new Set();
        const duplicateMachines = [];
        if (imported.machines) {
          imported.machines.forEach(m => {
            if (machineIds.has(m.id)) {
              duplicateMachines.push(m.id);
            }
            machineIds.add(m.id);
          });
        }

        if (duplicateMachines.length > 0) {
          alert(`Import failed: Duplicate machine IDs found: ${duplicateMachines.join(', ')}`);
          return;
        }

        const importedMachineIds = new Set(imported.machines?.map(m => m.id) || []);
        const cleanedRecipes = (imported.recipes || []).filter(r => importedMachineIds.has(r.machine_id));

        const currentProducts = [...products];
        uniqueProducts.forEach(newProduct => {
          const existingIndex = currentProducts.findIndex(p => p.id === newProduct.id);
          if (existingIndex >= 0) {
            currentProducts[existingIndex] = newProduct;
          } else {
            currentProducts.push(newProduct);
          }
        });
        updateProducts(currentProducts);

        if (imported.machines && imported.machines.length > 0) {
          const currentMachines = [...machines];
          const currentRecipes = [...recipes];
          
          const importedMachineIdSet = new Set(imported.machines.map(m => m.id));
          const recipesWithoutImportedMachines = currentRecipes.filter(
            r => !importedMachineIdSet.has(r.machine_id)
          );

          imported.machines.forEach(newMachine => {
            const existingIndex = currentMachines.findIndex(m => m.id === newMachine.id);
            if (existingIndex >= 0) {
              currentMachines[existingIndex] = newMachine;
            } else {
              currentMachines.push(newMachine);
            }
          });

          const finalRecipes = [...recipesWithoutImportedMachines, ...cleanedRecipes];

          updateMachines(currentMachines);
          updateRecipes(finalRecipes);
        }

        if (imported.canvas) {
          const clearCanvas = window.confirm('Clear current canvas and load imported layout?');
          if (clearCanvas) {
            const restoredNodes = (imported.canvas.nodes || []).map(node => ({
              ...node,
              data: {
                ...node.data,
                onInputClick: openRecipeSelectorForInput,
                onOutputClick: openRecipeSelectorForOutput,
                onDrillSettingsChange: handleDrillSettingsChange,
                onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange,
              }
            }));
            
            setNodes(restoredNodes);
            setEdges(imported.canvas.edges || []);
            setTargetProducts(imported.canvas.targetProducts || []);
            setNodeId(imported.canvas.nodeId || 0);
            setTargetIdCounter(imported.canvas.targetIdCounter || 0);
          }
        }

        alert('Import successful!');
        window.location.reload();
      } catch (error) {
        alert(`Import failed: ${error.message}`);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [setNodes, setEdges, openRecipeSelectorForInput, openRecipeSelectorForOutput, handleDrillSettingsChange, handleLogicAssemblerSettingsChange]);

  const handleExport = useCallback(() => {
    const exportData = {
      products: [...products],
      machines: [...machines],
      recipes: [...recipes],
      canvas: { nodes, edges, targetProducts, nodeId, targetIdCounter },
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `industrialist-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter]);

  const handleRestoreDefaults = useCallback(() => {
    if (window.confirm('Restore all data to defaults? This will clear the canvas and reset all products, machines, and recipes.')) {
      restoreDefaults();
      clearAll();
      window.location.reload();
    }
  }, [clearAll]);

  const closeSelector = () => {
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

  const filteredProducts = products
    .filter(p => {
      if (!p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterType !== 'all' && p.type !== filterType) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'price_asc') {
        const priceA = a.price === 'Variable' ? Infinity : a.price;
        const priceB = b.price === 'Variable' ? Infinity : b.price;
        return priceA - priceB;
      }
      if (sortBy === 'price_desc') {
        const priceA = a.price === 'Variable' ? -Infinity : a.price;
        const priceB = b.price === 'Variable' ? -Infinity : b.price;
        return priceB - priceA;
      }
      if (sortBy === 'rp_asc') {
        const rpA = a.rp_multiplier === 'Variable' ? Infinity : a.rp_multiplier;
        const rpB = b.rp_multiplier === 'Variable' ? Infinity : b.rp_multiplier;
        return rpA - rpB;
      }
      if (sortBy === 'rp_desc') {
        const rpA = a.rp_multiplier === 'Variable' ? -Infinity : a.rp_multiplier;
        const rpB = b.rp_multiplier === 'Variable' ? -Infinity : b.rp_multiplier;
        return rpB - rpA;
      }
      return 0;
    });

  const filteredMachines = machines
    .filter(m => {
      // Check if machine name matches search
      if (!m.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      // Include special machines (drill, assembler) or machines with recipes
      if (m.id === 'm_mineshaft_drill' || m.id === 'm_logic_assembler') return true;
      return getRecipesForMachine(m.id).length > 0;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const getAvailableRecipes = () => {
    if (!selectedProduct) return [];
    
    try {
      const producers = getRecipesProducingProductFiltered(selectedProduct.id);
      const consumers = getRecipesUsingProduct(selectedProduct.id);
      
      // Check if product is drill input or output
      const isDrillInput = canDrillUseProduct(selectedProduct.id);
      const isDrillOutput = Object.values(DEPTH_OUTPUTS).some(outputs => 
        outputs.some(o => o.product_id === selectedProduct.id)
      );
      
      // Check if product is logic assembler input or output
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
      
      // For "all" filter, include if it's either input or output
      const drillRecipes = (isDrillInput || isDrillOutput) ? [DEFAULT_DRILL_RECIPE] : [];
      const assemblerRecipes = (isAssemblerInput || isAssemblerOutput) ? [DEFAULT_LOGIC_ASSEMBLER_RECIPE] : [];
      const allRecipes = [...producers, ...consumers, ...drillRecipes, ...assemblerRecipes];
      return Array.from(new Map(allRecipes.map(r => [r.id, r])).values());
    } catch (error) {
      console.error('Error getting available recipes:', error);
      return [];
    }
  };

  const getMachineRecipes = () => {
    if (!selectedMachine) return [];
    return getRecipesForMachine(selectedMachine.id);
  };

  const handleMachineSelect = (machine) => {
    // Check if this is mineshaft drill or logic assembler - if so, create box directly
    if (machine.id === 'm_mineshaft_drill') {
      createRecipeBox(DEFAULT_DRILL_RECIPE);
      return;
    }
    if (machine.id === 'm_logic_assembler') {
      createRecipeBox(DEFAULT_LOGIC_ASSEMBLER_RECIPE);
      return;
    }
    // Otherwise, show recipes for this machine
    setSelectedMachine(machine);
  };

  const availableRecipes = selectorMode === 'product' ? getAvailableRecipes() : getMachineRecipes();

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
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background color="#333" gap={16} size={1} />
        <Controls />
        <MiniMap nodeColor="#d4a637" maskColor="rgba(10, 10, 10, 0.8)" />

        <Panel position="top-left" style={{ margin: '10px' }}>
          <div className="flex-col">
            <button onClick={openRecipeSelector} className="btn btn-primary">
              + Select Recipe
            </button>
            <button onClick={() => setShowTargetsModal(true)} className="btn btn-secondary">
              View Targets ({targetProducts.length})
            </button>
          </div>
        </Panel>

        <Panel position="top-right" style={{ margin: '10px' }}>
          <div className={`menu-container ${menuOpen ? '' : 'closed'}`}>
            <button onClick={() => setMenuOpen(!menuOpen)} className="btn btn-secondary btn-menu-toggle">
              {menuOpen ? '>' : '<'}
            </button>

            <div className="menu-buttons">
              <button onClick={clearAll} className="btn btn-secondary">Clear All</button>
              <button onClick={handleImport} className="btn btn-secondary">Import JSON</button>
              <button onClick={handleExport} className="btn btn-secondary">Export JSON</button>
              <button onClick={handleRestoreDefaults} className="btn btn-secondary">Restore Defaults</button>
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

      {/* Recipe Selection Modal */}
      {showRecipeSelector && (
        <div className="modal-overlay" onClick={closeSelector}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">
              {selectedProduct ? `Recipes for ${selectedProduct.name}` : selectedMachine ? `Recipes for ${selectedMachine.name}` : 'Select Product or Machine'}
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
                        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="select">
                          <option value="all">All Types</option>
                          <option value="item">Items Only</option>
                          <option value="fluid">Fluids Only</option>
                        </select>

                        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="select">
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
                            <div className="product-type">{product.type === 'item' ? '📦 Item' : '💧 Fluid'}</div>
                          </div>
                          <div className="text-right" style={{ alignSelf: 'center' }}>
                            {product.price === 'Variable' ? 'Variable' : `${product.price}`}
                          </div>
                          <div className="text-right" style={{ alignSelf: 'center' }}>
                            {product.rp_multiplier === 'Variable' ? 'Variable' : `${product.rp_multiplier.toFixed(1)}x`}
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
                        filteredMachines.map(machine => {
                          const recipeCount = getRecipesForMachine(machine.id).length;
                          return (
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
                                  : `${recipeCount} recipe${recipeCount !== 1 ? 's' : ''}`
                                }
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {selectorOpenedFrom === 'button' && (
                  <button 
                    onClick={() => {
                      setSelectedProduct(null);
                      setSelectedMachine(null);
                    }} 
                    className="btn btn-secondary btn-back"
                  >
                    ← Back
                  </button>
                )}

                {selectedProduct && (
                  <div className="mb-lg">
                    <select value={recipeFilter} onChange={(e) => setRecipeFilter(e.target.value)} className="select">
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
                      if (!machine || !recipe.inputs || !recipe.outputs) return null;
                      
                      return (
                        <div key={recipe.id} onClick={() => createRecipeBox(recipe)} className="recipe-card">
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
                      );
                    })
                  )}
                </div>
              </>
            )}

            <button onClick={closeSelector} className="btn btn-secondary" style={{ marginTop: '20px' }}>
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
                targetProducts.map(target => {
                  const productName = getProductName(target.productId, getProduct);
                  return (
                    <div key={target.id} className="target-card">
                      <div className="flex-1">
                        <div className="target-product-name">{productName}</div>
                        <div className="target-box-id">Box ID: {target.recipeBoxId}</div>
                      </div>

                      <div className="target-input-group">
                        <label className="target-label">Target:</label>
                        <input
                          type="number"
                          min="0"
                          value={target.desiredAmount}
                          onChange={(e) => updateTargetAmount(target.id, parseFloat(e.target.value) || 0)}
                          className="input input-small"
                        />
                        <span className="target-label">/s</span>
                      </div>

                      <button onClick={() => removeTargetStatus(target.id)} className="btn btn-delete">
                        Remove
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <button onClick={() => setShowTargetsModal(false)} className="btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;