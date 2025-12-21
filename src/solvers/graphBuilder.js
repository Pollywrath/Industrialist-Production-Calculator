import { hasTempDependentCycle, getTempDependentCycleTime, TEMP_DEPENDENT_MACHINES, recipeUsesSteam, getSteamInputIndex } from '../utils/temperatureDependentCycles';
import { DEFAULT_STEAM_TEMPERATURE } from '../utils/temperatureHandler';

export const buildProductionGraph = (nodes, edges) => {
  const graph = { nodes: {}, products: {}, connections: [] };

  nodes.forEach(node => {
    const nodeId = node.id;
    const recipe = node.data?.recipe;
    const machineCount = node.data?.machineCount || 0;
    const machine = node.data?.machine;
    if (!recipe) return;

    const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';
    const isLogicAssembler = recipe.isLogicAssembler || recipe.id === 'r_logic_assembler';
    const isTreeFarm = recipe.isTreeFarm || recipe.id === 'r_tree_farm';
    const isIndustrialFirebox = machine && machine.id === 'm_industrial_firebox';
    const isTempDependentVariable = machine && hasTempDependentCycle(machine.id);
    const isSpecialRecipe = isMineshaftDrill || isLogicAssembler || isTreeFarm || isIndustrialFirebox || isTempDependentVariable;

    let cycleTime = recipe.cycle_time;
    if (cycleTime === 'Variable' || typeof cycleTime !== 'number' || cycleTime <= 0) {
      if (!isSpecialRecipe) return;
      cycleTime = 1;
    }
    
    // Handle temperature-dependent cycle times
    const isTempDependent = machine && hasTempDependentCycle(machine.id);
    const tempDependentInfo = isTempDependent ? TEMP_DEPENDENT_MACHINES[machine.id] : null;
    
    if (isTempDependent && tempDependentInfo?.type === 'steam_input') {
      // For steam cracking plant, only apply if recipe uses steam
      if (machine.id === 'm_steam_cracking_plant' && !recipeUsesSteam(recipe)) {
        // Don't modify cycle time
      } else {
        const inputTemp = recipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE;
        cycleTime = getTempDependentCycleTime(machine.id, inputTemp, cycleTime);
      }
    }

    const graphNode = {
      id: nodeId,
      recipe,
      machineCount,
      cycleTime,
      isSpecialRecipe,
      isMineshaftDrill,
      isLogicAssembler,
      isTempDependent,
      inputs: [],
      outputs: []
    };

    recipe.inputs?.forEach((input, index) => {
      const productId = input.product_id;
      if (productId === 'p_variableproduct') return;

      const quantity = typeof input.quantity === 'number' ? input.quantity : 0;
      if (input.quantity === 'Variable' && !isSpecialRecipe) return;

      const rate = isMineshaftDrill ? quantity * machineCount : (quantity / cycleTime) * machineCount;

      const actualInputIndex = graphNode.inputs.length;
      graphNode.inputs.push({ productId, quantity, rate, index: actualInputIndex, connectedRate: 0, temperature: null });

      if (!graph.products[productId]) {
        graph.products[productId] = { producers: [], consumers: [], connections: [] };
      }
      graph.products[productId].consumers.push({ nodeId, inputIndex: actualInputIndex, rate });
    });

    // Water treatment plant uses standard outputs without modification
    // Cycle time adjustment is handled above
    const outputsToUse = recipe.outputs;

    outputsToUse?.forEach((output, index) => {
    const productId = output.product_id;
    if (productId === 'p_variableproduct') return;

    const quantity = typeof output.quantity === 'number' ? output.quantity : 0;
    if (output.quantity === 'Variable' && !isSpecialRecipe) return;

    const rate = isMineshaftDrill ? quantity * machineCount : (quantity / cycleTime) * machineCount;

    const actualOutputIndex = graphNode.outputs.length;
    graphNode.outputs.push({ 
      productId, quantity, rate, index: actualOutputIndex, connectedRate: 0, 
      temperature: output.temperature || null 
    });

    if (!graph.products[productId]) {
      graph.products[productId] = { producers: [], consumers: [], connections: [] };
    }
    graph.products[productId].producers.push({ nodeId, outputIndex: actualOutputIndex, rate });
  });

    graph.nodes[nodeId] = graphNode;
  });

  edges.forEach(edge => {
    const sourceNode = graph.nodes[edge.source];
    const targetNode = graph.nodes[edge.target];
    if (!sourceNode || !targetNode) return;

    const sourceOutputIndex = parseInt(edge.sourceHandle.split('-')[1]);
    const targetInputIndex = parseInt(edge.targetHandle.split('-')[1]);

    const sourceOutput = sourceNode.outputs[sourceOutputIndex];
    const targetInput = targetNode.inputs[targetInputIndex];

    if (!sourceOutput || !targetInput || sourceOutput.productId !== targetInput.productId) return;

    const productId = sourceOutput.productId;

    if (sourceOutput.temperature !== undefined && sourceOutput.temperature !== null) {
      targetInput.temperature = sourceOutput.temperature;
    }

    const connection = {
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      sourceOutputIndex,
      targetInputIndex,
      productId,
      sourceRate: sourceOutput.rate,
      targetRate: targetInput.rate,
      flowRate: 0,
      temperature: sourceOutput.temperature || null
    };

    graph.connections.push(connection);
    if (graph.products[productId]) {
      graph.products[productId].connections.push(connection);
    }
  });

  return graph;
};

export const getProducedProducts = (graph) => 
  Object.keys(graph.products).filter(productId => graph.products[productId].producers.length > 0);

export const getConsumedProducts = (graph) => 
  Object.keys(graph.products).filter(productId => graph.products[productId].consumers.length > 0);

export const getTotalProduction = (graph, productId) => {
  const productData = graph.products[productId];
  if (!productData) return 0;
  return productData.producers.reduce((sum, producer) => {
    const node = graph.nodes[producer.nodeId];
    const output = node.outputs[producer.outputIndex];
    return sum + output.rate;
  }, 0);
};

export const getTotalConsumption = (graph, productId) => {
  const productData = graph.products[productId];
  if (!productData) return 0;
  return productData.consumers.reduce((sum, consumer) => {
    const node = graph.nodes[consumer.nodeId];
    const input = node.inputs[consumer.inputIndex];
    return sum + input.rate;
  }, 0);
};