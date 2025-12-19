import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  DEFAULT_DRILL_RECIPE, DEPTH_OUTPUTS, calculateDrillMetrics 
} from './data/mineshaftDrill';
import { 
  DEFAULT_LOGIC_ASSEMBLER_RECIPE, MICROCHIP_STAGES, 
  calculateLogicAssemblerMetrics 
} from './data/logicAssembler';

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

function App() {
  // Canvas state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [nodeId, setNodeId] = useState(0);

  // Recipe selector modal
  const [showRecipeSelector, setShowRecipeSelector] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectorMode, setSelectorMode] = useState('product'); // 'product' or 'machine'
  const [selectorOpenedFrom, setSelectorOpenedFrom] = useState('button'); // 'button' or 'rectangle'

  // Recipe filtering and sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [filterType, setFilterType] = useState('all');
  const [recipeFilter, setRecipeFilter] = useState('all'); // 'all', 'producers', 'consumers'

  // Auto-connect feature: when clicking input/output, connect new recipe box
  const [autoConnectTarget, setAutoConnectTarget] = useState(null);

  // Target products for production goals
  const [targetProducts, setTargetProducts] = useState([]);
  const [showTargetsModal, setShowTargetsModal] = useState(false);
  const [targetIdCounter, setTargetIdCounter] = useState(0);

  // UI state
  const [menuOpen, setMenuOpen] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
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
  }, []);

  // Auto-save canvas state on any change
  useEffect(() => {
    saveCanvasState(nodes, edges, targetProducts, nodeId, targetIdCounter);
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter]);

  // Update node data while preserving identity
  const updateNodeData = (nodeId, updater) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: updater(n.data) } : n));
  };

  // Validate edge connections by product ID
  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    if (!sourceNode || !targetNode) return;

    const sourceProductId = sourceNode.data.recipe.outputs[parseInt(params.sourceHandle.split('-')[1])]?.product_id;
    const targetProductId = targetNode.data.recipe.inputs[parseInt(params.targetHandle.split('-')[1])]?.product_id;
    if (sourceProductId !== targetProductId) return;

    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false }, eds));
  }, [setEdges, nodes]);

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

  // Open recipe selector for product input - shows producer recipes
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

  // Open recipe selector for product output - shows consumer recipes
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
          ? { drilling: metrics.drillingPower * 1000000, idle: metrics.idlePower * 1000000 } 
          : 'Variable',
        pollution: metrics ? metrics.pollution : 'Variable',
      },
      leftHandles: Math.max(inputs.length, 1),
      rightHandles: Math.max(outputs.length, 1),
    }));

    // Remove edges connected to deleted input/output slots
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

    // Remove edges connected to deleted input/output slots
    setEdges((eds) => eds.filter(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        const handleIndex = parseInt((edge.source === nodeId ? edge.sourceHandle : edge.targetHandle).split('-')[1]);
        return edge.source === nodeId ? handleIndex < outputs.length : handleIndex < inputs.length;
      }
      return true;
    }));
  }, [setEdges]);

  // Create a new recipe box on canvas, optionally auto-connecting to existing box
  const createRecipeBox = useCallback((recipe) => {
    const machine = getMachine(recipe.machine_id);
    if (!machine || !recipe.inputs || !recipe.outputs) {
      alert('Error: Invalid machine or recipe data');
      return;
    }

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
        recipe, machine,
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

    // Auto-connect edge if opened from input/output click
    if (autoConnectTarget) {
      setTimeout(() => {
        const searchKey = autoConnectTarget.isOutput ? 'inputs' : 'outputs';
        const index = recipe[searchKey].findIndex(item => item.product_id === autoConnectTarget.productId);

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
          setEdges((eds) => addEdge(newEdge, eds));
        }
      }, 50);
    }

    setNodeId((id) => id + 1);
    resetSelector();
  }, [nodeId, nodes, setNodes, setEdges, openRecipeSelectorForInput, openRecipeSelectorForOutput, handleDrillSettingsChange, handleLogicAssemblerSettingsChange, autoConnectTarget]);

  // Delete recipe box and its associated target
  const deleteRecipeBoxAndTarget = useCallback((boxId) => {
    setNodes((nds) => nds.filter((n) => n.id !== boxId));
    setEdges((eds) => eds.filter((e) => e.source !== boxId && e.target !== boxId));
    setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== boxId));
  }, [setNodes, setEdges]);

  // Toggle target status on a recipe box (Shift+Click)
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

  // Node interactions: Shift+Click = toggle target, Ctrl+Alt+Click = delete
  const onNodeClick = useCallback((event, node) => {
    if (event.shiftKey && !event.ctrlKey && !event.altKey) {
      toggleTargetStatus(node);
    } else if (event.ctrlKey && event.altKey) {
      deleteRecipeBoxAndTarget(node.id);
    }
  }, [toggleTargetStatus, deleteRecipeBoxAndTarget]);

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
        
        // Merge products (newer data overwrites old)
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
              onInputClick: openRecipeSelectorForInput, 
              onOutputClick: openRecipeSelectorForOutput, 
              onDrillSettingsChange: handleDrillSettingsChange, 
              onLogicAssemblerSettingsChange: handleLogicAssemblerSettingsChange 
            }
          }));
          setNodes(restoredNodes);
          setEdges(imported.canvas.edges || []);
          setTargetProducts(imported.canvas.targetProducts || []);
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
  }, [setNodes, setEdges, openRecipeSelectorForInput, openRecipeSelectorForOutput, handleDrillSettingsChange, handleLogicAssemblerSettingsChange]);

  // Export canvas to JSON
  const handleExport = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify(
        { 
          products, 
          machines, 
          recipes, 
          canvas: { nodes, edges, targetProducts, nodeId, targetIdCounter } 
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
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter]);

  // Reset to default game data
  const handleRestoreDefaults = useCallback(() => {
    if (window.confirm('Restore all data to defaults? This will clear the canvas and reset all products, machines, and recipes.')) {
      restoreDefaults();
      setNodes([]);
      setEdges([]);
      setNodeId(0);
      setTargetProducts([]);
      setTargetIdCounter(0);
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

  // Filter machines (exclude empty ones)
  const filteredMachines = machines
    .filter(m => 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) && 
      (m.id === 'm_mineshaft_drill' || m.id === 'm_logic_assembler' || getRecipesForMachine(m.id).length > 0)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  // Handle machine selection - special machines bypass recipe list
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
            <button 
              onClick={() => setMenuOpen(!menuOpen)} 
              className="btn btn-secondary btn-menu-toggle"
            >
              {menuOpen ? '>' : '<'}
            </button>
            <div className="menu-buttons">
              <button 
                onClick={() => { setNodes([]); setEdges([]); setNodeId(0); setTargetProducts([]); setTargetIdCounter(0); }} 
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