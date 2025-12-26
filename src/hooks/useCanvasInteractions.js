import { useCallback } from 'react';

export const useCanvasInteractions = ({
  pendingNode, setPendingNode,
  setNodes, nodeId, setNodeId,
  reactFlowWrapper, reactFlowInstance,
  displayMode, machineDisplayMode, globalPollution,
  openRecipeSelectorForInput, openRecipeSelectorForOutput,
  handleDrillSettingsChange, handleLogicAssemblerSettingsChange,
  handleTreeFarmSettingsChange, handleIndustrialFireboxSettingsChange,
  handleTemperatureSettingsChange, handleBoilerSettingsChange,
  handleChemicalPlantSettingsChange, onNodeMiddleClick,
  setMousePosition
}) => {

  const handleCanvasMouseMove = useCallback((event) => {
    if (!reactFlowWrapper.current) return;

    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    setMousePosition({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    });
  }, [setMousePosition, reactFlowWrapper]);

  const handleCanvasClick = useCallback((event) => {
    if (!pendingNode || event.button !== 0) return;

    event.stopPropagation();

    if (!reactFlowInstance.current) return;

    const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
    if (!reactFlowBounds) return;

    const position = reactFlowInstance.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    position.x -= 160;
    position.y -= 150;

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
        globalPollution,
        isTarget: false,
        flows: null
      },
      sourcePosition: 'right',
      targetPosition: 'left'
    };

    setNodes((nds) => [...nds, newNode]);
    setNodeId((id) => id + 1);
    setPendingNode(null);
  }, [pendingNode, nodeId, displayMode, machineDisplayMode, globalPollution,
    openRecipeSelectorForInput, openRecipeSelectorForOutput,
    handleDrillSettingsChange, handleLogicAssemblerSettingsChange,
    handleTreeFarmSettingsChange, handleIndustrialFireboxSettingsChange,
    handleTemperatureSettingsChange, handleBoilerSettingsChange,
    handleChemicalPlantSettingsChange, onNodeMiddleClick,
    setNodes, setNodeId, setPendingNode, reactFlowWrapper, reactFlowInstance]);

  const handleCancelPlacement = useCallback((event) => {
    if (event.button === 2) {
      setPendingNode(null);
    }
  }, [setPendingNode]);

  return {
    handleCanvasMouseMove,
    handleCanvasClick,
    handleCancelPlacement
  };
};