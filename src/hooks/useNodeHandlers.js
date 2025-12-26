import { useCallback } from 'react';
import { calculateDrillMetrics, buildDrillInputs, buildDrillOutputs } from '../data/mineshaftDrill';
import { calculateLogicAssemblerMetrics, buildLogicAssemblerInputs, buildLogicAssemblerOutputs } from '../data/logicAssembler';
import { calculateTreeFarmMetrics, buildTreeFarmInputs, buildTreeFarmOutputs } from '../data/treeFarm';
import { calculateFireboxMetrics, buildFireboxInputs } from '../data/industrialFirebox';
import { applyChemicalPlantSettings } from '../data/chemicalPlant';
import { getMachine } from '../data/dataLoader';
import { recipes } from '../data/dataLoader';
import { clearFlowCache } from '../solvers/flowCalculator';

export const useNodeHandlers = ({
  nodes, setNodes, setEdges,
  targetProducts, setTargetProducts, targetIdCounter, setTargetIdCounter,
  setEditingNodeId, setEditingMachineCount, setShowMachineCountEditor,
  setPendingNode, nodesRef,
  globalPollution,
  setLastDrillConfig, setLastAssemblerConfig, setLastTreeFarmConfig, setLastFireboxConfig
}) => {

  const updateNodeData = useCallback((nodeId, updater) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: updater(n.data) } : n));
  }, [setNodes]);

  const cleanupInvalidConnections = useCallback((nodeId, inputs, outputs) => {
    setEdges((eds) => {
      const filteredEdges = eds.filter(edge => {
        if (edge.source === nodeId) {
          const handleIndex = parseInt(edge.sourceHandle.split('-')[1]);
          if (handleIndex >= outputs.length) return false;
          
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
      }
      
      return filteredEdges;
    });
  }, [setEdges, nodes]);

  const handleDrillSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    setLastDrillConfig({
      drillHead: settings.drillHead,
      consumable: settings.consumable,
      machineOil: settings.machineOil
    });
    
    const metrics = settings.drillHead && settings.depth ? calculateDrillMetrics(settings.drillHead, settings.consumable, settings.machineOil, settings.depth) : null;
    updateNodeData(nodeId, data => ({
      ...data, 
      recipe: { 
        ...data.recipe, 
        inputs: inputs.length > 0 ? inputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }],
        outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }], 
        drillSettings: settings, 
        cycle_time: 1,
        power_consumption: metrics ? { 
          max: metrics.drillingPower * 1000000, 
          average: ((metrics.drillingPower * metrics.lifeTime + metrics.idlePower * (metrics.replacementTime + metrics.travelTime)) / metrics.totalCycleTime) * 1000000 
        } : 'Variable',
        pollution: metrics ? metrics.pollution : 'Variable' 
      }, 
      leftHandles: Math.max(inputs.length, 1), 
      rightHandles: Math.max(outputs.length, 1)
    }));
    cleanupInvalidConnections(nodeId, inputs, outputs);
  }, [cleanupInvalidConnections, setLastDrillConfig, updateNodeData]);

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
      ...data, 
      recipe: { 
        ...data.recipe, 
        inputs: inputs.length > 0 ? inputs : [
          { product_id: 'p_logic_plate', quantity: 'Variable' }, 
          { product_id: 'p_copper_wire', quantity: 'Variable' },
          { product_id: 'p_semiconductor', quantity: 'Variable' }, 
          { product_id: 'p_gold_wire', quantity: 'Variable' }
        ],
        outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_variableproduct', quantity: 'Variable' }], 
        assemblerSettings: settings,
        cycle_time: metrics ? metrics.cycleTime : 'Variable', 
        power_consumption: metrics ? { max: metrics.maxPowerConsumption, average: metrics.avgPowerConsumption } : 'Variable' 
      },
      leftHandles: Math.max(inputs.length, 1), 
      rightHandles: Math.max(outputs.length, 1)
    }));
    cleanupInvalidConnections(nodeId, inputs, outputs);
  }, [cleanupInvalidConnections, setLastAssemblerConfig, updateNodeData]);

  const handleTreeFarmSettingsChange = useCallback((nodeId, settings, inputs, outputs) => {
    setLastTreeFarmConfig({
      trees: settings.trees,
      harvesters: settings.harvesters,
      sprinklers: settings.sprinklers,
      outputs: settings.outputs
    });
    
    const metrics = calculateTreeFarmMetrics(settings.trees, settings.harvesters, settings.sprinklers, settings.outputs, settings.controller, globalPollution);
    
    updateNodeData(nodeId, data => ({
      ...data, 
      recipe: { 
        ...data.recipe, 
        inputs: inputs.length > 0 ? inputs : [{ product_id: 'p_water', quantity: 'Variable' }],
        outputs: outputs.length > 0 ? outputs : [{ product_id: 'p_oak_log', quantity: 'Variable' }], 
        treeFarmSettings: settings, 
        cycle_time: 1,
        power_consumption: metrics ? metrics.avgPowerConsumption : 'Variable', 
        pollution: 0 
      }, 
      leftHandles: Math.max(inputs.length, 1), 
      rightHandles: Math.max(outputs.length, 1)
    }));
    setEdges((eds) => eds.filter(edge => {
      if (edge.source === nodeId || edge.target === nodeId) {
        const handleIndex = parseInt((edge.source === nodeId ? edge.sourceHandle : edge.targetHandle).split('-')[1]);
        return edge.source === nodeId ? handleIndex < outputs.length : handleIndex < inputs.length;
      }
      return true;
    }));
  }, [setEdges, globalPollution, setLastTreeFarmConfig, updateNodeData]);

  const handleIndustrialFireboxSettingsChange = useCallback((nodeId, settings, inputs, metrics) => {
    setLastFireboxConfig({ fuel: settings.fuel });
    
    updateNodeData(nodeId, data => ({
      ...data, 
      recipe: { 
        ...data.recipe, 
        inputs,
        fireboxSettings: settings, 
        cycle_time: metrics ? metrics.cycleTime : data.recipe.cycle_time,
        power_consumption: 0
      }
    }));
  }, [setLastFireboxConfig, updateNodeData]);

  const handleTemperatureSettingsChange = useCallback((nodeId, settings, outputs, powerConsumption) => {
    setNodes(nds => nds.map(n => 
      n.id === nodeId 
        ? { 
            ...n, 
            data: { 
              ...n.data, 
              recipe: { 
                ...n.data.recipe, 
                outputs, 
                temperatureSettings: settings, 
                power_consumption: powerConsumption !== null && powerConsumption !== undefined ? powerConsumption : n.data.recipe.power_consumption 
              } 
            } 
          }
        : n
    ));
  }, [setNodes]);

  const handleBoilerSettingsChange = useCallback((nodeId, settings) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const machine = getMachine(n.data.recipe.machine_id);
      const heatSource = machine ? { type: 'boiler' } : null;
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
      
      const baseRecipe = recipes.find(r => r.id === n.data.recipe.id);
      if (!baseRecipe) return n;
      
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
  }, [targetProducts, targetIdCounter, setTargetProducts, setTargetIdCounter, updateNodeData]);

  const deleteRecipeBoxAndTarget = useCallback((boxId) => {
    setNodes((nds) => nds.filter((n) => n.id !== boxId));
    setEdges((eds) => eds.filter((e) => e.source !== boxId && e.target !== boxId));
    setTargetProducts(prev => prev.filter(t => t.recipeBoxId !== boxId));
    clearFlowCache();
  }, [setNodes, setEdges, setTargetProducts]);

  const onNodeClick = useCallback((event, node) => {
    if (event.shiftKey && !event.ctrlKey && !event.altKey) {
      toggleTargetStatus(node);
    } else if (event.ctrlKey && event.altKey) {
      deleteRecipeBoxAndTarget(node.id);
    }
  }, [toggleTargetStatus, deleteRecipeBoxAndTarget]);

  const onNodeDoubleClick = useCallback((event, node) => {
    event.stopPropagation();
    setEditingNodeId(node.id);
    setEditingMachineCount(String(node.data?.machineCount ?? 0));
    setShowMachineCountEditor(true);
  }, [setEditingNodeId, setEditingMachineCount, setShowMachineCountEditor]);

  const onNodeMiddleClick = useCallback((nodeId) => {
    const node = nodesRef.current.find(n => n.id === nodeId);
    if (!node) return;
    
    const copiedRecipe = { ...node.data.recipe };
    const copiedMachine = node.data.machine;
    const copiedMachineCount = node.data.machineCount;
    
    setPendingNode({
      recipe: copiedRecipe,
      machine: copiedMachine,
      machineCount: copiedMachineCount
    });
  }, [nodesRef, setPendingNode]);

  return {
    handleDrillSettingsChange,
    handleLogicAssemblerSettingsChange,
    handleTreeFarmSettingsChange,
    handleIndustrialFireboxSettingsChange,
    handleTemperatureSettingsChange,
    handleBoilerSettingsChange,
    handleChemicalPlantSettingsChange,
    onNodeClick,
    onNodeDoubleClick,
    onNodeMiddleClick,
    deleteRecipeBoxAndTarget,
    updateNodeData,
    cleanupInvalidConnections
  };
};