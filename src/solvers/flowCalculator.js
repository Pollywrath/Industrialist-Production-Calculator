const calculateTotalProduction = (graph, productId) => {
  const productData = graph.products[productId];
  if (!productData) return 0;
  return productData.producers.reduce((sum, producer) => {
    const node = graph.nodes[producer.nodeId];
    const output = node.outputs[producer.outputIndex];
    return sum + output.rate;
  }, 0);
};

const calculateTotalConsumption = (graph, productId) => {
  const productData = graph.products[productId];
  if (!productData) return 0;
  return productData.consumers.reduce((sum, consumer) => {
    const node = graph.nodes[consumer.nodeId];
    const input = node.inputs[consumer.inputIndex];
    return sum + input.rate;
  }, 0);
};

const calculateProductConnectionFlows = (graph, productId, connections) => {
  const result = {
    totalProduction: calculateTotalProduction(graph, productId),
    totalConsumption: calculateTotalConsumption(graph, productId),
    connectedFlow: 0,
    connections: {}
  };

  const sourceGroups = {};
  const targetGroups = {};

  connections.forEach(conn => {
    const sourceKey = `${conn.sourceNodeId}-${conn.sourceOutputIndex}`;
    const targetKey = `${conn.targetNodeId}-${conn.targetInputIndex}`;
    if (!sourceGroups[sourceKey]) sourceGroups[sourceKey] = [];
    if (!targetGroups[targetKey]) targetGroups[targetKey] = [];
    sourceGroups[sourceKey].push(conn);
    targetGroups[targetKey].push(conn);
  });

  connections.forEach(conn => {
    const sourceKey = `${conn.sourceNodeId}-${conn.sourceOutputIndex}`;
    const targetKey = `${conn.targetNodeId}-${conn.targetInputIndex}`;
    const sourceConns = sourceGroups[sourceKey];
    const targetConns = targetGroups[targetKey];

    const totalSourceDemand = sourceConns.reduce((sum, c) => sum + c.targetRate, 0);
    const availableFromSource = totalSourceDemand > 0 
      ? (conn.sourceRate * conn.targetRate) / totalSourceDemand 
      : conn.sourceRate;

    const totalTargetSupply = targetConns.reduce((sum, c) => sum + c.sourceRate, 0);
    const neededByTarget = totalTargetSupply > 0 
      ? (conn.targetRate * conn.sourceRate) / totalTargetSupply 
      : conn.targetRate;

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

export const calculateProductFlows = (graph) => {
  const flows = {
    byProduct: {},
    byConnection: {},
    byNode: {}
  };

  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    flows.byNode[nodeId] = {
      inputFlows: node.inputs.map(input => ({ connected: 0, needed: input.rate })),
      outputFlows: node.outputs.map(output => ({ connected: 0, produced: output.rate }))
    };
  });

  Object.keys(graph.products).forEach(productId => {
    const productData = graph.products[productId];
    const connections = productData.connections;

    if (connections.length === 0) {
      flows.byProduct[productId] = {
        totalProduction: calculateTotalProduction(graph, productId),
        totalConsumption: calculateTotalConsumption(graph, productId),
        connectedFlow: 0
      };
      return;
    }

    const productFlows = calculateProductConnectionFlows(graph, productId, connections);
    flows.byProduct[productId] = productFlows;

    connections.forEach(conn => {
      const flowData = productFlows.connections[conn.id];
      if (flowData) {
        flows.byConnection[conn.id] = flowData;

        const sourceNode = flows.byNode[conn.sourceNodeId];
        if (sourceNode) {
          sourceNode.outputFlows[conn.sourceOutputIndex].connected += flowData.flowRate;
          sourceNode.outputFlows[conn.sourceOutputIndex].produced = conn.sourceRate;
        }

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

export const getConnectionFlow = (flows, connectionId) => flows.byConnection[connectionId]?.flowRate || 0;

export const getInputFlow = (flows, nodeId, inputIndex) => 
  flows.byNode[nodeId]?.inputFlows[inputIndex] || { connected: 0, needed: 0 };

export const getOutputFlow = (flows, nodeId, outputIndex) => 
  flows.byNode[nodeId]?.outputFlows[outputIndex] || { connected: 0, produced: 0 };