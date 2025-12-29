// LRU Cache for flow calculations with size limit
class LRUCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
}

let flowCache = new LRUCache(100);

// Union-Find for detecting connected components
class UnionFind {
  constructor(size) {
    this.parent = new Int32Array(size);
    this.rank = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      this.parent[i] = i;
    }
  }

  find(x) {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // Path compression
    }
    return this.parent[x];
  }

  union(x, y) {
    const rootX = this.find(x);
    const rootY = this.find(y);
    
    if (rootX === rootY) return;
    
    // Union by rank
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]++;
    }
  }
}

// Build port graph and find connected components
const findConnectedComponents = (graph, productId) => {
  const productData = graph.products[productId];
  if (!productData) return { components: [], portToComponent: new Map() };

  // Create unique port identifiers
  const ports = [];
  const portToIndex = new Map();
  
  // Add all source ports (outputs)
  productData.producers.forEach(producer => {
    const portKey = `out:${producer.nodeId}:${producer.outputIndex}`;
    if (!portToIndex.has(portKey)) {
      portToIndex.set(portKey, ports.length);
      ports.push({ type: 'output', nodeId: producer.nodeId, index: producer.outputIndex, rate: producer.rate });
    }
  });

  // Add all target ports (inputs)
  productData.consumers.forEach(consumer => {
    const portKey = `in:${consumer.nodeId}:${consumer.inputIndex}`;
    if (!portToIndex.has(portKey)) {
      portToIndex.set(portKey, ports.length);
      ports.push({ type: 'input', nodeId: consumer.nodeId, index: consumer.inputIndex, rate: consumer.rate });
    }
  });

  // Build union-find structure
  const uf = new UnionFind(ports.length);

  // Union ports connected by edges
  productData.connections.forEach(conn => {
    const sourceKey = `out:${conn.sourceNodeId}:${conn.sourceOutputIndex}`;
    const targetKey = `in:${conn.targetNodeId}:${conn.targetInputIndex}`;
    
    const sourceIdx = portToIndex.get(sourceKey);
    const targetIdx = portToIndex.get(targetKey);
    
    if (sourceIdx !== undefined && targetIdx !== undefined) {
      uf.union(sourceIdx, targetIdx);
    }
  });

  // Group ports by component
  const componentMap = new Map(); // root -> [portIndices]
  
  for (let i = 0; i < ports.length; i++) {
    const root = uf.find(i);
    if (!componentMap.has(root)) {
      componentMap.set(root, []);
    }
    componentMap.get(root).push(i);
  }

  // Build component structures
  const components = [];
  const portToComponent = new Map();
  
  let componentId = 0;
  componentMap.forEach((portIndices, root) => {
    const component = {
      id: componentId,
      ports: portIndices.map(idx => ports[idx]),
      connections: []
    };

    // Add connections within this component
    productData.connections.forEach(conn => {
      const sourceKey = `out:${conn.sourceNodeId}:${conn.sourceOutputIndex}`;
      
      const sourceIdx = portToIndex.get(sourceKey);
      
      if (sourceIdx !== undefined && uf.find(sourceIdx) === root) {
        component.connections.push(conn);
      }
    });

    // Map each port to its component
    portIndices.forEach(idx => {
      const port = ports[idx];
      const portKey = port.type === 'output' 
        ? `out:${port.nodeId}:${port.index}`
        : `in:${port.nodeId}:${port.index}`;
      portToComponent.set(portKey, componentId);
    });

    components.push(component);
    componentId++;
  });

  return { components, portToComponent, ports, portToIndex };
};

// Hash a single component for caching
const hashComponent = (component) => {
  const portHashes = component.ports.map(p => 
    `${p.type}:${p.nodeId}:${p.index}:${p.rate}`
  ).sort().join('|');
  
  const connHashes = component.connections.map(c =>
    `${c.sourceNodeId}:${c.sourceOutputIndex}->${c.targetNodeId}:${c.targetInputIndex}`
  ).sort().join('|');
  
  return `${portHashes}##${connHashes}`;
};

const calculateProductConnectionFlows = (graph, productId, connections) => {
  const totalProduction = calculateTotalProduction(graph, productId);
  const totalConsumption = calculateTotalConsumption(graph, productId);
  
  const result = {
    totalProduction,
    totalConsumption,
    connectedFlow: 0,
    connections: {}
  };

  if (connections.length === 0) return result;

  // Find connected components
  const { components, portToComponent } = findConnectedComponents(graph, productId);

  // Process each component independently
  components.forEach(component => {
    if (component.connections.length === 0) {
      // No connections in this component, skip flow calculation
      return;
    }

    const componentHash = hashComponent(component);
    const cacheKey = `${productId}:comp${component.id}`;
    const cached = flowCache.get(cacheKey);

    let componentResult;

    if (cached && cached.hash === componentHash) {
      // Use cached result
      componentResult = JSON.parse(JSON.stringify(cached.result));
    } else {
      // Compute flow for this component only
      const network = buildFlowNetworkOptimized(component.connections, totalProduction);
      const maxFlow = dinic(network);

      componentResult = {
        connectedFlow: 0,
        connections: {}
      };

      component.connections.forEach((conn, idx) => {
        const flowRate = maxFlow.connectionFlows[idx] || 0;
        
        componentResult.connections[conn.id] = {
          flowRate,
          supplyRatio: conn.sourceRate > 0 ? flowRate / conn.sourceRate : 0,
          demandRatio: conn.targetRate > 0 ? flowRate / conn.targetRate : 0
        };

        componentResult.connectedFlow += flowRate;
      });

      // Cache this component's result
      const frozenResult = Object.freeze({
        connectedFlow: componentResult.connectedFlow,
        connections: Object.freeze({ ...componentResult.connections })
      });
      
      flowCache.set(cacheKey, { hash: componentHash, result: frozenResult });
    }

    // Merge component results into main result
    Object.assign(result.connections, componentResult.connections);
    result.connectedFlow += componentResult.connectedFlow;
  });

  return result;
};

// Clamp tiny values to zero - use 10 decimal precision
const clampFlow = (flow) => {
  const EPSILON = 1e-10;
  return Math.abs(flow) < EPSILON ? 0 : Math.round(flow * 1e10) / 1e10;
};

// Build optimized flow network with integer indices
const buildFlowNetworkOptimized = (connections, totalProduction) => {
  const nodeToIndex = new Map();
  const indexToNode = [];
  let nodeCount = 0;

  const getNodeIndex = (nodeKey) => {
    if (!nodeToIndex.has(nodeKey)) {
      nodeToIndex.set(nodeKey, nodeCount);
      indexToNode.push(nodeKey);
      nodeCount++;
    }
    return nodeToIndex.get(nodeKey);
  };

  const SOURCE = getNodeIndex('virtual-source');
  const SINK = getNodeIndex('virtual-sink');

  const sources = new Map();
  const targets = new Map();

  connections.forEach(conn => {
    const sourceKey = `out:${conn.sourceNodeId}:${conn.sourceOutputIndex}`;
    const targetKey = `in:${conn.targetNodeId}:${conn.targetInputIndex}`;
    
    getNodeIndex(sourceKey);
    getNodeIndex(targetKey);
    
    if (!sources.has(sourceKey)) {
      sources.set(sourceKey, conn.sourceRate);
    }
    if (!targets.has(targetKey)) {
      targets.set(targetKey, conn.targetRate);
    }
  });

  const adj = Array.from({ length: nodeCount }, () => []);
  const edges = [];
  
  const maxCapacity = totalProduction || 1e6;

  const addEdge = (from, to, cap, connIndex = -1) => {
    const edgeIndex = edges.length;
    const revIndex = edges.length + 1;
    
    edges.push({ to, cap, flow: 0, rev: revIndex, connIndex });
    edges.push({ to: from, cap: 0, flow: 0, rev: edgeIndex, connIndex: -1 });
    
    adj[from].push(edgeIndex);
    adj[to].push(revIndex);
  };

  sources.forEach((capacity, sourceKey) => {
    addEdge(SOURCE, getNodeIndex(sourceKey), capacity);
  });

  targets.forEach((need, targetKey) => {
    addEdge(getNodeIndex(targetKey), SINK, need);
  });

  connections.forEach((conn, connIdx) => {
    const sourceKey = `out:${conn.sourceNodeId}:${conn.sourceOutputIndex}`;
    const targetKey = `in:${conn.targetNodeId}:${conn.targetInputIndex}`;
    const sourceIdx = getNodeIndex(sourceKey);
    const targetIdx = getNodeIndex(targetKey);
    
    addEdge(sourceIdx, targetIdx, maxCapacity, connIdx);
  });

  return { adj, edges, nodeCount, SOURCE, SINK };
};

// Circular queue for efficient BFS
class CircularQueue {
  constructor(capacity) {
    this.buffer = new Array(capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.capacity = capacity;
  }

  push(item) {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.size++;
  }

  shift() {
    const item = this.buffer[this.head];
    this.head = (this.head + 1) % this.capacity;
    this.size--;
    return item;
  }

  isEmpty() {
    return this.size === 0;
  }

  clear() {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }
}

// Dinic's algorithm with iterative DFS and typed arrays
const dinic = (network) => {
  const { adj, edges, nodeCount, SOURCE, SINK } = network;
  
  const level = new Int32Array(nodeCount);
  const iter = new Int32Array(nodeCount);
  const queue = new CircularQueue(nodeCount);

  const bfs = () => {
    level.fill(-1);
    level[SOURCE] = 0;
    queue.clear();
    queue.push(SOURCE);

    while (!queue.isEmpty()) {
      const v = queue.shift();
      const adjV = adj[v];
      const adjLen = adjV.length;
      
      for (let i = 0; i < adjLen; i++) {
        const edge = edges[adjV[i]];
        const residual = edge.cap - edge.flow;
        
        if (level[edge.to] < 0 && residual > 1e-15) {
          level[edge.to] = level[v] + 1;
          queue.push(edge.to);
        }
      }
    }

    return level[SINK] >= 0;
  };

  // Simplified iterative DFS - finds one augmenting path at a time
  const dfs = () => {
    const stack = [SOURCE];
    const parent = new Int32Array(nodeCount).fill(-1);
    const visited = new Uint8Array(nodeCount);
    visited[SOURCE] = 1;
    
    while (stack.length > 0) {
      const v = stack[stack.length - 1];
      
      if (v === SINK) {
        // Found path - calculate bottleneck
        let bottleneck = 1e15;
        let current = SINK;
        
        while (current !== SOURCE) {
          const edgeIdx = parent[current];
          const edge = edges[edgeIdx];
          const residual = edge.cap - edge.flow;
          bottleneck = Math.min(bottleneck, residual);
          
          // Find parent node
          let found = false;
          for (let node = 0; node < nodeCount; node++) {
            const nodeAdj = adj[node];
            for (let i = 0; i < nodeAdj.length; i++) {
              if (nodeAdj[i] === edgeIdx) {
                current = node;
                found = true;
                break;
              }
            }
            if (found) break;
          }
        }
        
        // Push flow
        current = SINK;
        while (current !== SOURCE) {
          const edgeIdx = parent[current];
          edges[edgeIdx].flow += bottleneck;
          edges[edges[edgeIdx].rev].flow -= bottleneck;
          
          // Find parent node
          let found = false;
          for (let node = 0; node < nodeCount; node++) {
            const nodeAdj = adj[node];
            for (let i = 0; i < nodeAdj.length; i++) {
              if (nodeAdj[i] === edgeIdx) {
                current = node;
                found = true;
                break;
              }
            }
            if (found) break;
          }
        }
        
        return bottleneck;
      }
      
      let found = false;
      const adjV = adj[v];
      
      for (let i = iter[v]; i < adjV.length; i++) {
        const edgeIdx = adjV[i];
        const edge = edges[edgeIdx];
        const residual = edge.cap - edge.flow;
        
        if (level[v] + 1 === level[edge.to] && residual > 1e-15 && !visited[edge.to]) {
          visited[edge.to] = 1;
          parent[edge.to] = edgeIdx;
          stack.push(edge.to);
          iter[v] = i;
          found = true;
          break;
        }
      }
      
      if (!found) {
        stack.pop();
        iter[v] = adjV.length;
      }
    }
    
    return 0;
  };

  let totalFlow = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 100000; // Safety limit

  while (bfs() && iterations++ < MAX_ITERATIONS) {
    iter.fill(0);
    
    while (true) {
      const pushed = dfs();
      if (pushed === 0) break;
      totalFlow += pushed;
    }
  }

  const connectionFlows = [];
  const edgeLen = edges.length;
  
  for (let i = 0; i < edgeLen; i++) {
    const edge = edges[i];
    if (edge.connIndex >= 0) {
      connectionFlows[edge.connIndex] = clampFlow(edge.flow);
    }
  }

  return { totalFlow, connectionFlows };
};

// Main export - calculates flows for all products in the graph
export const calculateProductFlows = (graph) => {
  const flows = {
    byProduct: {},
    byConnection: {},
    byNode: {}
  };

  // Initialize node flows
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    flows.byNode[nodeId] = {
      inputFlows: node.inputs.map(input => ({ connected: 0, needed: input.rate })),
      outputFlows: node.outputs.map(output => ({ connected: 0, produced: output.rate }))
    };
  });

  // Calculate flows for each product
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

    // Use optimized component-based calculation
    const productFlows = calculateProductConnectionFlows(graph, productId, connections);
    flows.byProduct[productId] = productFlows;

    // Update connection and node flows
    connections.forEach(conn => {
      const connData = productFlows.connections[conn.id];
      if (connData) {
        flows.byConnection[conn.id] = connData;

        const sourceNode = flows.byNode[conn.sourceNodeId];
        if (sourceNode) {
          sourceNode.outputFlows[conn.sourceOutputIndex].connected += connData.flowRate;
          sourceNode.outputFlows[conn.sourceOutputIndex].produced = conn.sourceRate;
        }

        const targetNode = flows.byNode[conn.targetNodeId];
        if (targetNode) {
          targetNode.inputFlows[conn.targetInputIndex].connected += connData.flowRate;
          targetNode.inputFlows[conn.targetInputIndex].needed = conn.targetRate;
        }
      }
    });
  });

  return flows;
};

// Helper functions for external use
export const getConnectionFlow = (flows, connectionId) => flows.byConnection[connectionId]?.flowRate || 0;

export const getInputFlow = (flows, nodeId, inputIndex) => 
  flows.byNode[nodeId]?.inputFlows[inputIndex] || { connected: 0, needed: 0 };

export const getOutputFlow = (flows, nodeId, outputIndex) => 
  flows.byNode[nodeId]?.outputFlows[outputIndex] || { connected: 0, produced: 0 };

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

export const clearFlowCache = () => {
  flowCache.clear();
};