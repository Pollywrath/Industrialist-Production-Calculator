/**
 * Graph Builder - Convert ReactFlow nodes/edges into a structured production graph
 * 
 * Creates a graph representation that's easier to work with for production calculations:
 * - Nodes represent recipe boxes with their production/consumption rates
 * - Edges represent material connections between boxes
 * - Products are aggregated across all producers/consumers
 * - Temperature data is tracked for water and steam products
 */

/**
 * Build a production graph from ReactFlow data
 * @param {Array} nodes - Recipe box nodes
 * @param {Array} edges - Connection edges
 * @returns {Object} Graph with nodes, products, and connection info
 */
export const buildProductionGraph = (nodes, edges) => {
  const graph = {
    nodes: {},        // nodeId -> node data with computed rates
    products: {},     // productId -> { producers: [], consumers: [], connections: [] }
    connections: []   // List of all connections with flow info
  };

  // Step 1: Process all nodes and compute their production/consumption rates
  nodes.forEach(node => {
    const nodeId = node.id;
    const recipe = node.data?.recipe;
    const machineCount = node.data?.machineCount || 0;

    if (!recipe) return;

    // Check if this is a special recipe with custom handling
    const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';
    const isLogicAssembler = recipe.isLogicAssembler || recipe.id === 'r_logic_assembler';
    const isSpecialRecipe = isMineshaftDrill || isLogicAssembler;

    // Get cycle time - skip if Variable unless it's a special recipe
    let cycleTime = recipe.cycle_time;
    if (cycleTime === 'Variable' || typeof cycleTime !== 'number' || cycleTime <= 0) {
      if (!isSpecialRecipe) {
        // Skip this node from computation - has Variable values without special handling
        return;
      }
      // Special recipes handle their own Variable values, so they don't need a cycle time
      cycleTime = 1; // This won't be used for special recipes
    }

    const graphNode = {
      id: nodeId,
      recipe,
      machineCount,
      cycleTime,
      isSpecialRecipe,
      isMineshaftDrill,
      isLogicAssembler,
      inputs: [],   // { productId, quantity, rate, index, temperature }
      outputs: []   // { productId, quantity, rate, index, temperature }
    };

    // Process inputs (consumption)
    recipe.inputs?.forEach((input, index) => {
      const productId = input.product_id;
      if (productId === 'p_variableproduct') return;

      const quantity = typeof input.quantity === 'number' ? input.quantity : 0;
      
      // Skip Variable quantities unless special recipe (they compute their own rates)
      if (input.quantity === 'Variable' && !isSpecialRecipe) {
        return;
      }

      // Rate calculation:
      // - Drill: quantities are already per-second, just multiply by machine count
      // - Assembler: quantities are per-cycle, convert to per-second (divide by cycle time)
      // - Normal recipes: quantities are per-cycle, convert to per-second (divide by cycle time)
      const rate = isMineshaftDrill 
        ? quantity * machineCount 
        : (quantity / cycleTime) * machineCount;

      graphNode.inputs.push({
        productId,
        quantity,
        rate,
        index,
        connectedRate: 0, // Will be filled by edge analysis
        temperature: null // Will be filled by connected outputs
      });

      // Track this node as a consumer of this product
      if (!graph.products[productId]) {
        graph.products[productId] = {
          producers: [],
          consumers: [],
          connections: []
        };
      }
      graph.products[productId].consumers.push({
        nodeId,
        inputIndex: index,
        rate
      });
    });

    // Process outputs (production)
    recipe.outputs?.forEach((output, index) => {
      const productId = output.product_id;
      if (productId === 'p_variableproduct') return;

      const quantity = typeof output.quantity === 'number' ? output.quantity : 0;
      
      // Skip Variable quantities unless special recipe (they compute their own rates)
      if (output.quantity === 'Variable' && !isSpecialRecipe) {
        return;
      }

      // Rate calculation:
      // - Drill: quantities are already per-second, just multiply by machine count
      // - Assembler: quantities are per-cycle, convert to per-second (divide by cycle time)
      // - Normal recipes: quantities are per-cycle, convert to per-second (divide by cycle time)
      const rate = isMineshaftDrill 
        ? quantity * machineCount 
        : (quantity / cycleTime) * machineCount;

      graphNode.outputs.push({
        productId,
        quantity,
        rate,
        index,
        connectedRate: 0, // Will be filled by edge analysis
        temperature: output.temperature || null // Include temperature if present
      });

      // Track this node as a producer of this product
      if (!graph.products[productId]) {
        graph.products[productId] = {
          producers: [],
          consumers: [],
          connections: []
        };
      }
      graph.products[productId].producers.push({
        nodeId,
        outputIndex: index,
        rate
      });
    });

    graph.nodes[nodeId] = graphNode;
  });

  // Step 2: Process edges to determine connection flows and temperature transfer
  edges.forEach(edge => {
    const sourceNodeId = edge.source;
    const targetNodeId = edge.target;
    const sourceNode = graph.nodes[sourceNodeId];
    const targetNode = graph.nodes[targetNodeId];

    if (!sourceNode || !targetNode) return;

    const sourceOutputIndex = parseInt(edge.sourceHandle.split('-')[1]);
    const targetInputIndex = parseInt(edge.targetHandle.split('-')[1]);

    const sourceOutput = sourceNode.outputs[sourceOutputIndex];
    const targetInput = targetNode.inputs[targetInputIndex];

    if (!sourceOutput || !targetInput) return;
    if (sourceOutput.productId !== targetInput.productId) return;

    const productId = sourceOutput.productId;

    // Transfer temperature from output to input
    if (sourceOutput.temperature !== undefined && sourceOutput.temperature !== null) {
      targetInput.temperature = sourceOutput.temperature;
    }

    // Create connection record
    const connection = {
      id: edge.id,
      sourceNodeId,
      targetNodeId,
      sourceOutputIndex,
      targetInputIndex,
      productId,
      sourceRate: sourceOutput.rate,  // How much source produces (per second)
      targetRate: targetInput.rate,   // How much target needs (per second)
      flowRate: 0,                     // Actual flow (calculated later)
      temperature: sourceOutput.temperature || null // Track temperature in connection
    };

    graph.connections.push(connection);
    
    // Track connection in product data
    if (graph.products[productId]) {
      graph.products[productId].connections.push(connection);
    }
  });

  return graph;
};

/**
 * Get all products that are produced in the network
 * @param {Object} graph - Production graph
 * @returns {Array} List of productIds with producers
 */
export const getProducedProducts = (graph) => {
  return Object.keys(graph.products).filter(
    productId => graph.products[productId].producers.length > 0
  );
};

/**
 * Get all products that are consumed in the network
 * @param {Object} graph - Production graph
 * @returns {Array} List of productIds with consumers
 */
export const getConsumedProducts = (graph) => {
  return Object.keys(graph.products).filter(
    productId => graph.products[productId].consumers.length > 0
  );
};

/**
 * Get total production rate for a product (across all producers)
 * @param {Object} graph - Production graph
 * @param {string} productId - Product ID
 * @returns {number} Total production rate per second
 */
export const getTotalProduction = (graph, productId) => {
  const productData = graph.products[productId];
  if (!productData) return 0;

  return productData.producers.reduce((sum, producer) => {
    const node = graph.nodes[producer.nodeId];
    const output = node.outputs[producer.outputIndex];
    return sum + output.rate;
  }, 0);
};

/**
 * Get total consumption rate for a product (across all consumers)
 * @param {Object} graph - Production graph
 * @param {string} productId - Product ID
 * @returns {number} Total consumption rate per second
 */
export const getTotalConsumption = (graph, productId) => {
  const productData = graph.products[productId];
  if (!productData) return 0;

  return productData.consumers.reduce((sum, consumer) => {
    const node = graph.nodes[consumer.nodeId];
    const input = node.inputs[consumer.inputIndex];
    return sum + input.rate;
  }, 0);
};