import React, { useCallback, useEffect, useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, addEdge, Panel } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import CustomNode from './components/CustomNode';
import CustomEdge from './components/CustomEdge';
import { getRecipesUsingProduct, getRecipesProducingProductFiltered, getRecipesForMachine } from './utils/appUtilities';
import { DEFAULT_DRILL_RECIPE } from './data/mineshaftDrill';
import { DEFAULT_LOGIC_ASSEMBLER_RECIPE } from './data/logicAssembler';
import { DEFAULT_TREE_FARM_RECIPE } from './data/treeFarm';
import { calculateMachineCountForAutoConnect, getSpecialRecipeInputs, getSpecialRecipeOutputs } from './utils/recipeBoxCreation';
import { DEFAULT_STEAM_TEMPERATURE } from './utils/temperatureHandler';
import ThemeEditor, { applyTheme, loadTheme } from './components/ThemeEditor';
import LeftPanel from './components/LeftPanel';
import ExtendedPanel from './components/ExtendedPanel';
import RightPanel from './components/RightPanel';
import RecipeSelectorModal from './components/RecipeSelectorModal';
import TargetsModal from './components/TargetsModal';
import MachineCountEditor from './components/MachineCountEditor';
import PendingNodePreview from './components/PendingNodePreview';
import { useAppState } from './hooks/useAppState';
import { useNodeHandlers } from './hooks/useNodeHandlers';
import { useRecipeCreation } from './hooks/useRecipeCreation';
import { useEdgeHandlers } from './hooks/useEdgeHandlers';
import { useCanvasInteractions } from './hooks/useCanvasInteractions';
import { useDataImportExport } from './hooks/useDataImportExport';
import { usePollutionEffects } from './hooks/usePollutionEffects';
import { useProductionSolver } from './hooks/useProductionSolver';
import { restoreDefaults } from './data/dataLoader';
import { clearFlowCache } from './solvers/flowCalculator';
import { calculateTotalStats, calculateMachineStats } from './utils/statsCalculations';

if (process.env.NODE_ENV === 'development') {
  let lastMemory = 0;
  setInterval(() => {
    if (performance.memory) {
      const current = performance.memory.usedJSHeapSize / 1048576;
      const total = performance.memory.totalJSHeapSize / 1048576;
      const limit = performance.memory.jsHeapSizeLimit / 1048576;
      const delta = current - lastMemory;
      if (Math.abs(delta) > 10) {
        console.log(`Memory: ${current.toFixed(1)}MB / ${total.toFixed(1)}MB (limit: ${limit.toFixed(0)}MB) ${delta > 0 ? '+' : ''}${delta.toFixed(1)}MB`);
      }
      lastMemory = current;
    }
  }, 3000);
}

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

const isForestTheme = () => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim().toLowerCase() === '#5fb573';

function App() {
  const appState = useAppState();
  const {
    nodes, setNodes, edges, setEdges, nodeId, setNodeId,
    showRecipeSelector, setShowRecipeSelector,
    keepOverlayDuringTransition, setKeepOverlayDuringTransition,
    selectedProduct, setSelectedProduct,
    selectedMachine, setSelectedMachine,
    selectorMode, setSelectorMode,
    searchTerm, setSearchTerm,
    sortBy, setSortBy,
    filterType, setFilterType,
    recipeFilter, setRecipeFilter,
    autoConnectTarget, setAutoConnectTarget,
    targetProducts, setTargetProducts,
    showTargetsModal, setShowTargetsModal,
    targetIdCounter, setTargetIdCounter,
    showMachineCountEditor, setShowMachineCountEditor,
    editingNodeId, setEditingNodeId,
    editingMachineCount, setEditingMachineCount,
    newNodePendingMachineCount, setNewNodePendingMachineCount,
    menuOpen, setMenuOpen,
    showThemeEditor, setShowThemeEditor,
    extendedPanelOpen, setExtendedPanelOpen,
    edgeSettings, setEdgeSettings,
    extendedPanelClosing, setExtendedPanelClosing,
    leftPanelCollapsed, setLeftPanelCollapsed,
    globalPollution, setGlobalPollution,
    pollutionInputFocused, setPollutionInputFocused,
    isPollutionPaused, setIsPollutionPaused,
    soldProducts, setSoldProducts,
    displayMode, setDisplayMode,
    machineDisplayMode, setMachineDisplayMode,
    favoriteRecipes, setFavoriteRecipes,
    lastDrillConfig, setLastDrillConfig,
    lastAssemblerConfig, setLastAssemblerConfig,
    lastTreeFarmConfig, setLastTreeFarmConfig,
    lastFireboxConfig, setLastFireboxConfig,
    recipeMachineCounts, setRecipeMachineCounts,
    pendingNode, setPendingNode,
    mousePosition, setMousePosition,
    reactFlowWrapper,
    reactFlowInstance,
    fileInputRef,
    nodesRef,
    onNodesChange,
    onEdgesChange,
    resetSelector,
    loadState
  } = appState;

  const nodeHandlers = useNodeHandlers({
    nodes, setNodes, setEdges,
    targetProducts, setTargetProducts, targetIdCounter, setTargetIdCounter,
    setEditingNodeId, setEditingMachineCount, setShowMachineCountEditor,
    setPendingNode, nodesRef,
    globalPollution,
    setLastDrillConfig, setLastAssemblerConfig, setLastTreeFarmConfig, setLastFireboxConfig
  });

  const edgeHandlers = useEdgeHandlers({
    nodes, setEdges, setShowRecipeSelector, setSelectedProduct,
    setAutoConnectTarget, setRecipeFilter
  });

  const recipeCreation = useRecipeCreation({
    nodes, setNodes, nodeId, setNodeId,
    setEdges, autoConnectTarget, displayMode, machineDisplayMode,
    lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig,
    setLastDrillConfig, setLastAssemblerConfig, setLastTreeFarmConfig, setLastFireboxConfig,
    recipeMachineCounts, selectedProduct, globalPollution,
    reactFlowWrapper, reactFlowInstance, edgeSettings,
    openRecipeSelectorForInput: edgeHandlers.openRecipeSelectorForInput,
    openRecipeSelectorForOutput: edgeHandlers.openRecipeSelectorForOutput,
    handleDrillSettingsChange: nodeHandlers.handleDrillSettingsChange,
    handleLogicAssemblerSettingsChange: nodeHandlers.handleLogicAssemblerSettingsChange,
    handleTreeFarmSettingsChange: nodeHandlers.handleTreeFarmSettingsChange,
    handleIndustrialFireboxSettingsChange: nodeHandlers.handleIndustrialFireboxSettingsChange,
    handleTemperatureSettingsChange: nodeHandlers.handleTemperatureSettingsChange,
    handleBoilerSettingsChange: nodeHandlers.handleBoilerSettingsChange,
    handleChemicalPlantSettingsChange: nodeHandlers.handleChemicalPlantSettingsChange,
    onNodeMiddleClick: nodeHandlers.onNodeMiddleClick
  });

  const canvasInteractions = useCanvasInteractions({
    pendingNode, setPendingNode,
    setNodes, nodeId, setNodeId,
    reactFlowWrapper, reactFlowInstance,
    displayMode, machineDisplayMode, globalPollution,
    openRecipeSelectorForInput: edgeHandlers.openRecipeSelectorForInput,
    openRecipeSelectorForOutput: edgeHandlers.openRecipeSelectorForOutput,
    handleDrillSettingsChange: nodeHandlers.handleDrillSettingsChange,
    handleLogicAssemblerSettingsChange: nodeHandlers.handleLogicAssemblerSettingsChange,
    handleTreeFarmSettingsChange: nodeHandlers.handleTreeFarmSettingsChange,
    handleIndustrialFireboxSettingsChange: nodeHandlers.handleIndustrialFireboxSettingsChange,
    handleTemperatureSettingsChange: nodeHandlers.handleTemperatureSettingsChange,
    handleBoilerSettingsChange: nodeHandlers.handleBoilerSettingsChange,
    handleChemicalPlantSettingsChange: nodeHandlers.handleChemicalPlantSettingsChange,
    onNodeMiddleClick: nodeHandlers.onNodeMiddleClick,
    setMousePosition
  });

  const dataImportExport = useDataImportExport({
    setNodes, setEdges, setTargetProducts, setSoldProducts, setFavoriteRecipes,
    setLastDrillConfig, setLastAssemblerConfig, setLastTreeFarmConfig, setLastFireboxConfig,
    setNodeId, setTargetIdCounter, fileInputRef,
    displayMode, machineDisplayMode, globalPollution,
    openRecipeSelectorForInput: edgeHandlers.openRecipeSelectorForInput,
    openRecipeSelectorForOutput: edgeHandlers.openRecipeSelectorForOutput,
    handleDrillSettingsChange: nodeHandlers.handleDrillSettingsChange,
    handleLogicAssemblerSettingsChange: nodeHandlers.handleLogicAssemblerSettingsChange,
    handleTreeFarmSettingsChange: nodeHandlers.handleTreeFarmSettingsChange,
    handleIndustrialFireboxSettingsChange: nodeHandlers.handleIndustrialFireboxSettingsChange,
    handleTemperatureSettingsChange: nodeHandlers.handleTemperatureSettingsChange,
    handleBoilerSettingsChange: nodeHandlers.handleBoilerSettingsChange,
    handleChemicalPlantSettingsChange: nodeHandlers.handleChemicalPlantSettingsChange,
    onNodeMiddleClick: nodeHandlers.onNodeMiddleClick
  });

  usePollutionEffects({
    nodes, setNodes, globalPollution, setGlobalPollution, pollutionInputFocused, isPollutionPaused
  });

  const { productionSolution, excessProducts, deficientProducts } = useProductionSolver({
    nodes, edges, soldProducts
  });

  // Apply theme on mount
  useEffect(() => {
    const theme = loadTheme();
    applyTheme(theme);
    setEdgeSettings({
      edgePath: theme.edgePath || 'orthogonal',
      edgeStyle: theme.edgeStyle || 'animated'
    });
  }, []);

  // Load saved state on mount
  useEffect(() => {
    const savedState = loadState();
    if (savedState) {
      dataImportExport.loadCanvasState(savedState);
    }
  }, []);

  // Update node display modes
  useEffect(() => {
    setNodes(nds => nds.map(node => ({
      ...node,
      data: {
        ...node.data,
        displayMode,
        machineDisplayMode
      }
    })));
  }, [displayMode, machineDisplayMode, setNodes]);

  // Update edges when settings change
  useEffect(() => {
    setEdges(eds => eds.map(edge => ({
      ...edge,
      data: edgeSettings
    })));
  }, [edgeSettings, setEdges]);

  // Save canvas state
  useEffect(() => {
    dataImportExport.saveCanvasState({
      nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts,
      favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig
    });
  }, [nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts,
    favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig]);

  // Update nodesRef
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Update flows
  useEffect(() => {
    if (productionSolution?.flows?.byNode) {
      const flowUpdateTimeoutRef = setTimeout(() => {
        setNodes(nds => nds.map(node => ({
          ...node,
          data: { ...node.data, flows: productionSolution.flows.byNode[node.id] || null }
        })));
      }, 250);
      return () => clearTimeout(flowUpdateTimeoutRef);
    }
  }, [productionSolution, setNodes]);

  // Calculate machine counts for recipe selector
  const calculateMachineCountForRecipe = useCallback((recipe, targetNode, autoConnect) => {
    const lastConfigs = {
      drillConfig: lastDrillConfig,
      assemblerConfig: lastAssemblerConfig,
      treeFarmConfig: lastTreeFarmConfig,
      fireboxConfig: lastFireboxConfig
    };
    const flows = productionSolution?.flows || null;
    return calculateMachineCountForAutoConnect(
      recipe,
      targetNode,
      autoConnect,
      recipeCreation.findBestDepthForProduct,
      lastConfigs,
      globalPollution,
      flows
    );
  }, [lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig,
    recipeCreation.findBestDepthForProduct, globalPollution, productionSolution]);

  // Update recipe machine counts when selector is shown
  useEffect(() => {
    if (showRecipeSelector) {
      const getAvailableRecipes = () => {
        if (!selectedProduct) return [];
        const producers = getRecipesProducingProductFiltered(selectedProduct.id);
        const consumers = getRecipesUsingProduct(selectedProduct.id);
        const specialRecipes = [DEFAULT_DRILL_RECIPE, DEFAULT_LOGIC_ASSEMBLER_RECIPE, DEFAULT_TREE_FARM_RECIPE];
        const specialProducers = specialRecipes.filter(sr =>
          getSpecialRecipeOutputs(sr.id).includes(selectedProduct.id)
        );
        const specialConsumers = specialRecipes.filter(sr =>
          getSpecialRecipeInputs(sr.id).includes(selectedProduct.id)
        );
        if (recipeFilter === 'producers') {
          return [...producers, ...specialProducers];
        }
        if (recipeFilter === 'consumers') {
          return [...consumers, ...specialConsumers];
        }
        return Array.from(new Map(
          [...producers, ...consumers, ...specialProducers, ...specialConsumers]
            .map(r => [r.id, r])
        ).values());
      };

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
  }, [showRecipeSelector, selectorMode, selectedProduct, selectedMachine, autoConnectTarget,
    nodes, recipeFilter, calculateMachineCountForRecipe, setRecipeMachineCounts]);

  // Listen for theme changes
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

  // Update edge settings when theme editor closes
  useEffect(() => {
    if (!showThemeEditor) {
      const theme = loadTheme();
      setEdgeSettings({
        edgePath: theme.edgePath || 'orthogonal',
        edgeStyle: theme.edgeStyle || 'animated'
      });
    }
  }, [showThemeEditor]);

  // Clear flow cache periodically
  useEffect(() => {
    const interval = setInterval(() => {
      clearFlowCache();
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const baseStats = calculateTotalStats(nodes);
    return {
      ...baseStats,
      totalProfit: excessProducts.reduce((profit, item) =>
        item.isSold && typeof item.product.price === 'number'
          ? profit + item.product.price * item.excessRate
          : profit, 0)
    };
  }, [nodes, excessProducts]);

  const machineStats = useMemo(() => calculateMachineStats(nodes), [nodes]);

  const onConnect = useCallback((params) => {
    const sourceNode = nodes.find(n => n.id === params.source);
    const targetNode = nodes.find(n => n.id === params.target);
    if (!sourceNode || !targetNode) return;
    const sourceProductId = sourceNode.data.recipe.outputs[parseInt(params.sourceHandle.split('-')[1])]?.product_id;
    const targetProductId = targetNode.data.recipe.inputs[parseInt(params.targetHandle.split('-')[1])]?.product_id;
    if (sourceProductId !== targetProductId) return;
    setEdges((eds) => addEdge({ ...params, type: 'custom', animated: false, data: edgeSettings }, eds));
    clearFlowCache();
  }, [setEdges, nodes, edgeSettings]);

  const handleCompute = useCallback(() => alert('Computation to come soon!'), []);

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

  const handleClearAll = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setNodeId(0);
    setTargetProducts([]);
    setTargetIdCounter(0);
    setSoldProducts({});
    setLastDrillConfig(null);
    setLastAssemblerConfig(null);
    setLastTreeFarmConfig(null);
    setLastFireboxConfig(null);
    clearFlowCache();
  }, [setNodes, setEdges, setNodeId, setTargetProducts, setTargetIdCounter,
    setSoldProducts, setLastDrillConfig, setLastAssemblerConfig, setLastTreeFarmConfig, setLastFireboxConfig]);

  const handleRestoreDefaults = useCallback(() => {
    if (window.confirm('Restore all data to defaults? This will clear the canvas and reset all products, machines, and recipes.')) {
      restoreDefaults();
      handleClearAll();
      window.location.reload();
    }
  }, [handleClearAll]);

  const statisticsTitle = isForestTheme() ? "Plant Statistics" : "Plan Statistics";

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        ref={reactFlowWrapper}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={nodeHandlers.onNodeClick}
        onNodeDoubleClick={nodeHandlers.onNodeDoubleClick}
        onMouseMove={canvasInteractions.handleCanvasMouseMove}
        onClick={canvasInteractions.handleCanvasClick}
        onContextMenu={canvasInteractions.handleCancelPlacement}
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
        defaultEdgeOptions={{ type: 'custom' }}
      >
        <Background color="#333" gap={16} size={1} />
        <Controls className={(extendedPanelOpen || extendedPanelClosing) && !leftPanelCollapsed ? 'controls-shifted' : ''} />
        <MiniMap
          nodeColor={() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()}
          maskColor={getComputedStyle(document.documentElement).getPropertyValue('--bg-overlay').trim()}
        />

        <Panel position="top-left" style={{ margin: '10px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', flexDirection: 'column' }}>
            <LeftPanel
              stats={stats}
              leftPanelCollapsed={leftPanelCollapsed}
              setLeftPanelCollapsed={setLeftPanelCollapsed}
              extendedPanelOpen={extendedPanelOpen}
              setExtendedPanelOpen={handleExtendedPanelToggle}
              openRecipeSelector={edgeHandlers.openRecipeSelector}
              setShowTargetsModal={setShowTargetsModal}
              targetProductsCount={targetProducts.length}
              handleCompute={handleCompute}
              statisticsTitle={statisticsTitle}
            />

            {(extendedPanelOpen || extendedPanelClosing) && (
              <ExtendedPanel
                extendedPanelOpen={extendedPanelOpen}
                extendedPanelClosing={extendedPanelClosing}
                displayMode={displayMode}
                setDisplayMode={setDisplayMode}
                machineDisplayMode={machineDisplayMode}
                setMachineDisplayMode={setMachineDisplayMode}
                globalPollution={globalPollution}
                setGlobalPollution={setGlobalPollution}
                isPollutionPaused={isPollutionPaused}
                setIsPollutionPaused={setIsPollutionPaused}
                pollutionInputFocused={pollutionInputFocused}
                setPollutionInputFocused={setPollutionInputFocused}
                excessProducts={excessProducts}
                setSoldProducts={setSoldProducts}
                deficientProducts={deficientProducts}
                machineStats={machineStats}
              />
            )}
          </div>
        </Panel>

        <Panel position="top-right" style={{ margin: '10px' }}>
          <RightPanel
            menuOpen={menuOpen}
            setMenuOpen={setMenuOpen}
            onClearAll={handleClearAll}
            onImport={dataImportExport.handleImport}
            onExportData={dataImportExport.handleExportData}
            onExportCanvas={() => dataImportExport.handleExportCanvas({
              nodes, edges, targetProducts, nodeId, targetIdCounter, soldProducts,
              favoriteRecipes, lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig
            })}
            onRestoreDefaults={handleRestoreDefaults}
            onThemeEditor={() => setShowThemeEditor(true)}
          />
        </Panel>
      </ReactFlow>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={dataImportExport.processImport}
      />

      {(showMachineCountEditor || keepOverlayDuringTransition) && (
        <MachineCountEditor
          show={showMachineCountEditor}
          editingMachineCount={editingMachineCount}
          setEditingMachineCount={setEditingMachineCount}
          onUpdate={() => {
            let value = parseFloat(editingMachineCount);
            if (isNaN(value) || value <= 0) {
              if (newNodePendingMachineCount) {
                alert('Machine count must be greater than 0. Please enter a valid number.');
                return;
              }
              value = 1;
            }

            if (editingNodeId && !newNodePendingMachineCount) {
              nodeHandlers.updateNodeData(editingNodeId, data => ({ ...data, machineCount: value }));
            } else if (newNodePendingMachineCount) {
              nodeHandlers.updateNodeData(newNodePendingMachineCount, data => ({ ...data, machineCount: value }));
            }

            setShowMachineCountEditor(false);
            setEditingNodeId(null);
            setEditingMachineCount('');
            setNewNodePendingMachineCount(null);
          }}
          onCancel={() => {
            if (newNodePendingMachineCount) {
              nodeHandlers.deleteRecipeBoxAndTarget(newNodePendingMachineCount);
              setShowRecipeSelector(true);
              setSelectedProduct(null);
              setSelectedMachine(null);
              setSelectorMode('product');
            }
            setShowMachineCountEditor(false);
            setEditingNodeId(null);
            setEditingMachineCount('');
            setNewNodePendingMachineCount(null);
          }}
        />
      )}

      {showRecipeSelector && (
        <RecipeSelectorModal
          selectedProduct={selectedProduct}
          setSelectedProduct={setSelectedProduct}
          selectedMachine={selectedMachine}
          selectorMode={selectorMode}
          setSelectorMode={setSelectorMode}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          sortBy={sortBy}
          setSortBy={setSortBy}
          filterType={filterType}
          setFilterType={setFilterType}
          recipeFilter={recipeFilter}
          setRecipeFilter={setRecipeFilter}
          favoriteRecipes={favoriteRecipes}
          setFavoriteRecipes={setFavoriteRecipes}
          recipeMachineCounts={recipeMachineCounts}
          autoConnectTarget={autoConnectTarget}
          onClose={resetSelector}
          onSelectRecipe={(recipe, overrideMachineCount) => {
            const calculatedCount = overrideMachineCount ?? (recipeMachineCounts[recipe.id] ?? 1);
            if (calculatedCount <= 0) {
              const newNodeId = recipeCreation.createRecipeBox(recipe, 1);
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
              recipeCreation.createRecipeBox(recipe, calculatedCount);
              resetSelector();
            }
          }}
          onEditMachineCount={(recipe) => {
            const calculatedCount = recipeMachineCounts[recipe.id] ?? 1;
            const initialCount = calculatedCount <= 0 ? 1 : calculatedCount;
            const newNodeId = recipeCreation.createRecipeBox(recipe, initialCount);
            setKeepOverlayDuringTransition(true);
            setShowRecipeSelector(false);
            setTimeout(() => {
              setNewNodePendingMachineCount(newNodeId);
              setEditingNodeId(newNodeId);
              setEditingMachineCount(String(initialCount));
              setShowMachineCountEditor(true);
              setKeepOverlayDuringTransition(false);
            }, 50);
          }}
        />
      )}

      {showTargetsModal && (
        <TargetsModal
          targetProducts={targetProducts}
          setTargetProducts={setTargetProducts}
          onClose={() => setShowTargetsModal(false)}
        />
      )}

      {showThemeEditor && (
        <ThemeEditor onClose={() => setShowThemeEditor(false)} />
      )}

      {pendingNode && (
        <PendingNodePreview
          pendingNode={pendingNode}
          mousePosition={mousePosition}
        />
      )}
    </div>
  );
}

export default App;