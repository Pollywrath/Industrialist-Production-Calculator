/**
 * Flow Calculator - Determine how products flow through connections
 * 
 * Calculates the actual flow rate through each connection, handling:
 * - Multiple producers feeding one consumer (split demand proportionally)
 * - One producer feeding multiple consumers (split supply proportionally)
 * - Insufficient supply (flow limited by production)
 * - Insufficient demand (flow limited by consumption)
 * 
 * Strategy: For each connection, flow = min(available supply, needed demand)
 * When multiple connections share a source or target, split proportionally
 */

/**
 * Calculate flows through all connections in the network
 * @param {Object} graph - Production graph from buildProductionGraph
 * @returns {Object} Flow data for each product
 */
export const calculateProductFlows = (graph) => {
  const flows = {
    byProduct: {},      // productId -> { totalProduction, totalConsumption, connectedFlow }
    byConnection: {},   // connectionId -> { flowRate, supplyRatio, demandRatio }
    byNode: {}          // nodeId -> { inputFlows: [], outputFlows: [] }
  };

  // Initialize flow tracking for each node
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    
    flows.byNode[nodeId] = {
      inputFlows: node.inputs.map(input => ({ 
        connected: 0, 
        needed: input.rate // Initialize with actual need, not 0
      })),
      outputFlows: node.outputs.map(output => ({ 
        connected: 0, 
        produced: output.rate // Initialize with actual production
      }))
    };
  });

  // Process each product independently
  Object.keys(graph.products).forEach(productId => {
    const productData = graph.products[productId];
    const connections = productData.connections;

    if (connections.length === 0) {
      // No connections for this product
      flows.byProduct[productId] = {
        totalProduction: calculateTotalProduction(graph, productId),
        totalConsumption: calculateTotalConsumption(graph, productId),
        connectedFlow: 0
      };
      return;
    }

    // Calculate flows for this product's connections
    const productFlows = calculateProductConnectionFlows(graph, productId, connections);
    flows.byProduct[productId] = productFlows;

    // Update connection and node flow data
    connections.forEach(conn => {
      const flowData = productFlows.connections[conn.id];
      if (flowData) {
        flows.byConnection[conn.id] = flowData;

        // Update source node output flow
        const sourceNode = flows.byNode[conn.sourceNodeId];
        if (sourceNode) {
          sourceNode.outputFlows[conn.sourceOutputIndex].connected += flowData.flowRate;
          sourceNode.outputFlows[conn.sourceOutputIndex].produced = conn.sourceRate;
        }

        // Update target node input flow
        const targetNode = flows.byNode[conn.targetNodeId];
        if (targetNode) {
          targetNode.inputFlows[conn.targetInputIndex].connected += flowData.flowRate;
          targetNode.inputFlows[conn.targetInputIndex].needed = conn.targetRate;
        }
      }
    });
  });

  return flows;
};

/**
 * Calculate flows for all connections of a specific product
 * @param {Object} graph - Production graph
 * @param {string} productId - Product ID
 * @param {Array} connections - Connections for this product
 * @returns {Object} Flow data for this product
 */
const calculateProductConnectionFlows = (graph, productId, connections) => {
  const result = {
    totalProduction: calculateTotalProduction(graph, productId),
    totalConsumption: calculateTotalConsumption(graph, productId),
    connectedFlow: 0,
    connections: {}
  };

  // Group connections by source (output) and target (input)
  const sourceGroups = {}; // sourceNodeId-outputIndex -> connections[]
  const targetGroups = {}; // targetNodeId-inputIndex -> connections[]

  connections.forEach(conn => {
    const sourceKey = `${conn.sourceNodeId}-${conn.sourceOutputIndex}`;
    const targetKey = `${conn.targetNodeId}-${conn.targetInputIndex}`;

    if (!sourceGroups[sourceKey]) sourceGroups[sourceKey] = [];
    if (!targetGroups[targetKey]) targetGroups[targetKey] = [];

    sourceGroups[sourceKey].push(conn);
    targetGroups[targetKey].push(conn);
  });

  // Calculate flow for each connection
  connections.forEach(conn => {
    const sourceKey = `${conn.sourceNodeId}-${conn.sourceOutputIndex}`;
    const targetKey = `${conn.targetNodeId}-${conn.targetInputIndex}`;

    const sourceConns = sourceGroups[sourceKey]; // All connections from this output
    const targetConns = targetGroups[targetKey]; // All connections to this input

    // Calculate available supply (split among all consumers from this source)
    const totalSourceDemand = sourceConns.reduce((sum, c) => sum + c.targetRate, 0);
    const availableFromSource = totalSourceDemand > 0
      ? (conn.sourceRate * conn.targetRate) / totalSourceDemand
      : conn.sourceRate;

    // Calculate needed demand (split among all suppliers to this target)
    const totalTargetSupply = targetConns.reduce((sum, c) => sum + c.sourceRate, 0);
    const neededByTarget = totalTargetSupply > 0
      ? (conn.targetRate * conn.sourceRate) / totalTargetSupply
      : conn.targetRate;

    // Actual flow is limited by both supply and demand
    const flowRate = Math.min(availableFromSource, neededByTarget, conn.sourceRate, conn.targetRate);

    result.connections[conn.id] = {
      flowRate,
      supplyRatio: conn.sourceRate > 0 ? flowRate / conn.sourceRate : 0,
      demandRatio: conn.targetRate > 0 ? flowRate / conn.targetRate : 0
    };

    result.connectedFlow += flowRate;
  });

  return result;
};

/**
 * Calculate total production for a product
 * @param {Object} graph - Production graph
 * @param {string} productId - Product ID
 * @returns {number} Total production rate
 */
const calculateTotalProduction = (graph, productId) => {
  const productData = graph.products[productId];
  if (!productData) return 0;

  return productData.producers.reduce((sum, producer) => {
    const node = graph.nodes[producer.nodeId];
    const output = node.outputs[producer.outputIndex];
    return sum + output.rate;
  }, 0);
};

/**
 * Calculate total consumption for a product
 * @param {Object} graph - Production graph
 * @param {string} productId - Product ID
 * @returns {number} Total consumption rate
 */
const calculateTotalConsumption = (graph, productId) => {
  const productData = graph.products[productId];
  if (!productData) return 0;

  return productData.consumers.reduce((sum, consumer) => {
    const node = graph.nodes[consumer.nodeId];
    const input = node.inputs[consumer.inputIndex];
    return sum + input.rate;
  }, 0);
};

/**
 * Get flow through a specific connection
 * @param {Object} flows - Flow data from calculateProductFlows
 * @param {string} connectionId - Connection ID
 * @returns {number} Flow rate through this connection
 */
export const getConnectionFlow = (flows, connectionId) => {
  return flows.byConnection[connectionId]?.flowRate || 0;
};

/**
 * Get total flow into a node's input
 * @param {Object} flows - Flow data from calculateProductFlows
 * @param {string} nodeId - Node ID
 * @param {number} inputIndex - Input index
 * @returns {Object} { connected, needed }
 */
export const getInputFlow = (flows, nodeId, inputIndex) => {
  return flows.byNode[nodeId]?.inputFlows[inputIndex] || { connected: 0, needed: 0 };
};

/**
 * Get total flow from a node's output
 * @param {Object} flows - Flow data from calculateProductFlows
 * @param {string} nodeId - Node ID
 * @param {number} outputIndex - Output index
 * @returns {Object} { connected, produced }
 */
export const getOutputFlow = (flows, nodeId, outputIndex) => {
  return flows.byNode[nodeId]?.outputFlows[outputIndex] || { connected: 0, produced: 0 };
};