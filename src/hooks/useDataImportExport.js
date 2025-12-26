import { useCallback } from 'react';
import { products, machines, recipes, getMachine, getProduct, updateProducts, updateMachines, updateRecipes } from '../data/dataLoader';
import { initializeRecipeTemperatures } from '../utils/appUtilities';
import { clearFlowCache } from '../solvers/flowCalculator';

export const useDataImportExport = ({
  setNodes, setEdges, setTargetProducts, setSoldProducts, setFavoriteRecipes,
  setLastDrillConfig, setLastAssemblerConfig, setLastTreeFarmConfig, setLastFireboxConfig,
  setNodeId, setTargetIdCounter, fileInputRef,
  displayMode, machineDisplayMode, globalPollution,
  openRecipeSelectorForInput, openRecipeSelectorForOutput,
  handleDrillSettingsChange, handleLogicAssemblerSettingsChange,
  handleTreeFarmSettingsChange, handleIndustrialFireboxSettingsChange,
  handleTemperatureSettingsChange, handleBoilerSettingsChange,
  handleChemicalPlantSettingsChange, onNodeMiddleClick
}) => {

  const handleImport = useCallback(() => fileInputRef.current?.click(), [fileInputRef]);

  const processImport = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);

        const isDataImport = imported.products || imported.machines || imported.recipes;
        const isCanvasImport = imported.canvas;

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

        if (isCanvasImport) {
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
                globalPollution,
                flows: null
              }
            };
          });

          setNodes(restoredNodes);
          setEdges(imported.canvas.edges || []);
          setTargetProducts(imported.canvas.targetProducts || []);
          setSoldProducts(imported.canvas.soldProducts || {});
          setFavoriteRecipes(imported.canvas.favoriteRecipes || []);
          setLastDrillConfig(imported.canvas.lastDrillConfig || null);
          setLastAssemblerConfig(imported.canvas.lastAssemblerConfig || null);
          setLastTreeFarmConfig(imported.canvas.lastTreeFarmConfig || null);
          setLastFireboxConfig(imported.canvas.lastFireboxConfig || null);
          setNodeId(imported.canvas.nodeId || 0);
          setTargetIdCounter(imported.canvas.targetIdCounter || 0);

          clearFlowCache();
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
  }, []);

  const handleExportCanvas = useCallback((canvasState) => {
    const canvas = canvasState;
    const blob = new Blob([JSON.stringify({ canvas }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `industrialist-canvas-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const saveCanvasState = useCallback((state) => {
    localStorage.setItem('industrialist_canvas_state', JSON.stringify(state));
  }, []);

  const loadCanvasState = useCallback((savedState) => {
    const restoredNodes = savedState.nodes.map(node => {
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
          globalPollution,
          flows: null
        }
      };
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
  }, [displayMode, machineDisplayMode, globalPollution, openRecipeSelectorForInput, openRecipeSelectorForOutput,
    handleDrillSettingsChange, handleLogicAssemblerSettingsChange, handleTreeFarmSettingsChange,
    handleIndustrialFireboxSettingsChange, handleTemperatureSettingsChange, handleBoilerSettingsChange,
    handleChemicalPlantSettingsChange, onNodeMiddleClick, setNodes, setEdges, setTargetProducts,
    setSoldProducts, setFavoriteRecipes, setLastDrillConfig, setLastAssemblerConfig,
    setLastTreeFarmConfig, setLastFireboxConfig, setNodeId, setTargetIdCounter]);

  return {
    handleImport,
    processImport,
    handleExportData,
    handleExportCanvas,
    saveCanvasState,
    loadCanvasState
  };
};