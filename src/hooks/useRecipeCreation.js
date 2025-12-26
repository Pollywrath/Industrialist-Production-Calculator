import { useCallback } from 'react';
import { addEdge } from '@xyflow/react';
import { getMachine } from '../data/dataLoader';
import { configureSpecialRecipe, isSpecialRecipe } from '../utils/recipeBoxCreation';
import { initializeRecipeTemperatures } from '../utils/appUtilities';
import { HEAT_SOURCES, calculateOutputTemperature, DEFAULT_BOILER_INPUT_TEMPERATURE } from '../utils/temperatureHandler';
import { applyTemperatureToOutputs } from '../utils/appUtilities';
import { DEPTH_OUTPUTS, calculateDrillMetrics } from '../data/mineshaftDrill';

const calculateResidueAmount = (globalPollution) => {
  const x = globalPollution;
  if (x < 0) return 0;
  const lnArg = 1 + (5429 * x) / 7322;
  return Math.pow(Math.log(lnArg), 1.1);
};

export const useRecipeCreation = ({
  nodes, setNodes, nodeId, setNodeId,
  setEdges, autoConnectTarget, displayMode, machineDisplayMode,
  lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig,
  setLastDrillConfig, setLastAssemblerConfig, setLastTreeFarmConfig, setLastFireboxConfig,
  recipeMachineCounts, selectedProduct, globalPollution,
  reactFlowWrapper, reactFlowInstance, edgeSettings,
  openRecipeSelectorForInput, openRecipeSelectorForOutput,
  handleDrillSettingsChange, handleLogicAssemblerSettingsChange,
  handleTreeFarmSettingsChange, handleIndustrialFireboxSettingsChange,
  handleTemperatureSettingsChange, handleBoilerSettingsChange,
  handleChemicalPlantSettingsChange, onNodeMiddleClick
}) => {

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
          // Calculate average rate per second for this specific product
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
      position = {
        x: targetNode.position.x + (autoConnectTarget.isOutput ? 400 : -400),
        y: targetNode.position.y
      };
    } else {
      if (reactFlowInstance.current && reactFlowWrapper.current) {
        const bounds = reactFlowWrapper.current.getBoundingClientRect();
        const centerX = bounds.width / 2;
        const centerY = bounds.height / 2;
        
        const flowPosition = reactFlowInstance.current.screenToFlowPosition({
          x: bounds.left + centerX,
          y: bounds.top + centerY,
        });
        
        const nodeWidth = 320;
        const nodeHeight = 300;
        const spacing = 50;
        
        let finalPosition = { x: flowPosition.x - nodeWidth / 2, y: flowPosition.y - nodeHeight / 2 };
        
        let attempts = 0;
        const maxAttempts = 20;
        while (attempts < maxAttempts) {
          const hasOverlap = nodes.some(node => {
            const dx = Math.abs(node.position.x - finalPosition.x);
            const dy = Math.abs(node.position.y - finalPosition.y);
            return dx < nodeWidth + spacing && dy < nodeHeight + spacing;
          });
          
          if (!hasOverlap) break;
          
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
        position = {
          x: Math.random() * 400 + 100,
          y: Math.random() * 300 + 100
        };
      }
    }
    
    const isBoiler = HEAT_SOURCES[machine.id]?.type === 'boiler';
    
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
        leftHandles: recipeWithTemp.inputs.length,
        rightHandles: recipeWithTemp.outputs.length,
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
        isTarget: false,
        flows: null
      },
      sourcePosition: 'right',
      targetPosition: 'left'
    };
    
    setNodes((nds) => {
      const updatedNodes = [...nds, newNode];
      if (autoConnectTarget && calculatedMachineCount > 0) {
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
              data: edgeSettings
            };
            setEdges((eds) => addEdge(newEdge, eds));
          }
        }, 50);
      }
      return updatedNodes;
    });
    
    setNodeId((id) => id + 1);
    return newNodeId;
  }, [nodeId, nodes, setNodes, setEdges, autoConnectTarget, displayMode, machineDisplayMode,
    lastDrillConfig, lastAssemblerConfig, lastTreeFarmConfig, lastFireboxConfig,
    setLastDrillConfig, setLastAssemblerConfig, setLastTreeFarmConfig, setLastFireboxConfig,
    recipeMachineCounts, selectedProduct, globalPollution, reactFlowWrapper, reactFlowInstance,
    edgeSettings, openRecipeSelectorForInput, openRecipeSelectorForOutput,
    handleDrillSettingsChange, handleLogicAssemblerSettingsChange, handleTreeFarmSettingsChange,
    handleIndustrialFireboxSettingsChange, handleTemperatureSettingsChange,
    handleBoilerSettingsChange, handleChemicalPlantSettingsChange, onNodeMiddleClick,
    setNodeId, findBestDepthForProduct]);

  return {
    createRecipeBox,
    findBestDepthForProduct
  };
};