import type {
  SolverGraph,
  SolverConnection,
  FlowEdge,
  FlowNetwork,
  FlowResults,
} from '../types/solver';
import { clampFlow, EPSILON } from '../utils/precision';
import {
  findProductConnectedComponents,
  getProductConnectionSourceKey,
  getProductConnectionTargetKey,
  type ProductComponent,
} from './productComponents';

class LRUCache<V> {
  cache = new Map<string, V>();
  maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string): V | null {
    if (this.cache.has(key)) {
      const value = this.cache.get(key)!;
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return null;
  }

  set(key: string, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    this.cache.set(key, value);
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value!;
      this.cache.delete(oldestKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

class CircularQueue {
  buffer: number[];
  head = 0;
  tail = 0;
  size = 0;
  capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: number): void {
    if (this.size >= this.capacity) {
      this.resize();
    }
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.size++;
  }

  private resize(): void {
    const newCapacity = this.capacity === 0 ? 8 : this.capacity * 2;
    const newBuffer = new Array(newCapacity);

    for (let i = 0; i < this.size; i++) {
      newBuffer[i] = this.buffer[(this.head + i) % this.capacity];
    }

    this.buffer = newBuffer;
    this.head = 0;
    this.tail = this.size;
    this.capacity = newCapacity;
  }

  shift(): number {
    const item = this.buffer[this.head];
    this.head = (this.head + 1) % this.capacity;
    this.size--;
    return item;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }
}

function hashComponent(component: ProductComponent): string {
  const portHashes = component.ports
    .map((p) => `${p.type}:${p.nodeId}:${p.index}:${p.rate}`)
    .sort()
    .join('|');
  const connHashes = component.connections
    .map(
      (c) =>
        `${c.id}:${c.sourceNodeId}:${c.sourceOutputIndex}->${c.targetNodeId}:${c.targetInputIndex}`,
    )
    .sort()
    .join('|');
  return `${portHashes}##${connHashes}`;
}

function buildFlowNetwork(connections: SolverConnection[], totalProduction: number): FlowNetwork {
  const nodeToIndex = new Map<string, number>();
  let nodeCount = 0;

  const getNodeIndex = (nodeKey: string): number => {
    let idx = nodeToIndex.get(nodeKey);
    if (idx === undefined) {
      idx = nodeCount++;
      nodeToIndex.set(nodeKey, idx);
    }
    return idx;
  };

  const SOURCE = getNodeIndex('virtual-source');
  const SINK = getNodeIndex('virtual-sink');

  const sources = new Map<string, number>();
  const targets = new Map<string, number>();

  for (const conn of connections) {
    const sourceKey = getProductConnectionSourceKey(conn);
    const targetKey = getProductConnectionTargetKey(conn);
    getNodeIndex(sourceKey);
    getNodeIndex(targetKey);
    if (!sources.has(sourceKey)) {
      sources.set(sourceKey, conn.sourceRate);
    }
    if (!targets.has(targetKey)) {
      targets.set(targetKey, conn.targetRate);
    }
  }

  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  const edges: FlowEdge[] = [];
  const maxCapacity = totalProduction;

  const addEdge = (from: number, to: number, cap: number, connIndex = -1) => {
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
    const sourceKey = getProductConnectionSourceKey(conn);
    const targetKey = getProductConnectionTargetKey(conn);
    addEdge(getNodeIndex(sourceKey), getNodeIndex(targetKey), maxCapacity, connIdx);
  });

  return { adj, edges, nodeCount, SOURCE, SINK };
}

function dinic(network: FlowNetwork): {
  totalFlow: number;
  connectionFlows: number[];
} {
  const { adj, edges, nodeCount, SOURCE, SINK } = network;

  const level = new Int32Array(nodeCount);
  const iter = new Int32Array(nodeCount);
  const queue = new CircularQueue(nodeCount);

  const bfs = (): boolean => {
    level.fill(-1);
    level[SOURCE] = 0;
    queue.clear();
    queue.push(SOURCE);

    while (!queue.isEmpty()) {
      const v = queue.shift();
      const adjV = adj[v];
      for (let i = 0; i < adjV.length; i++) {
        const edge = edges[adjV[i]];
        const residual = edge.cap - edge.flow;
        if (level[edge.to] < 0 && residual > EPSILON) {
          level[edge.to] = level[v] + 1;
          queue.push(edge.to);
        }
      }
    }
    return level[SINK] >= 0;
  };

  const dfs = (u: number, pushed: number): number => {
    if (pushed === 0) return 0;
    if (u === SINK) return pushed;

    let totalPushed = 0;
    const adjU = adj[u];
    for (; iter[u] < adjU.length; iter[u]++) {
      const i = iter[u];
      const edgeIdx = adjU[i];
      const edge = edges[edgeIdx];
      const to = edge.to;
      const cap = edge.cap - edge.flow;

      if (level[u] + 1 === level[to] && cap > EPSILON) {
        const tr = dfs(to, Math.min(pushed - totalPushed, cap));
        if (tr > 0) {
          edge.flow += tr;
          edges[edge.rev].flow -= tr;
          totalPushed += tr;
          if (totalPushed >= pushed - EPSILON) {
            break;
          }
        }
      }
    }
    return totalPushed;
  };

  let totalFlow = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 100000;

  while (bfs() && iterations++ < MAX_ITERATIONS) {
    iter.fill(0);
    while (true) {
      const pushed = dfs(SOURCE, 1e15);
      if (pushed === 0) break;
      totalFlow += pushed;
    }
  }

  const connectionFlows: number[] = [];
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (edge.connIndex >= 0) {
      connectionFlows[edge.connIndex] = clampFlow(edge.flow);
    }
  }

  return { totalFlow, connectionFlows };
}

const flowCache = new LRUCache<{
  connectionFlows: Record<string, number>;
}>(1000);

function runFlowPass(
  graph: SolverGraph,
  bypassCache = false,
): {
  results: FlowResults;
  edgeFlows: Record<string, number>;
} {
  const results: FlowResults = new Map();
  const edgeFlows: Record<string, number> = {};

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    results.set(nodeId, {
      inputFlows: node.inputs.map((inp) => ({
        rate: inp.rate,
        connected: 0,
        hasDeficiency: inp.rate > 0,
        hasExcess: false,
      })),
      outputFlows: node.outputs.map((out) => ({
        rate: out.rate,
        connected: 0,
        hasDeficiency: false,
        hasExcess: out.rate > 0,
      })),
    });
  }

  for (const [, productData] of Object.entries(graph.products)) {
    for (const conn of productData.connections) {
      edgeFlows[conn.id] = 0;
    }
  }

  for (const [, productData] of Object.entries(graph.products)) {
    if (productData.connections.length === 0) continue;

    const components = findProductConnectedComponents(productData);

    for (const component of components) {
      if (component.connections.length === 0) continue;

      let connFlowMap: Record<string, number> | null = null;
      let componentHash = '';

      if (!bypassCache) {
        componentHash = hashComponent(component);
        const cached = flowCache.get(componentHash);
        if (cached) {
          connFlowMap = cached.connectionFlows;
        }
      }

      if (!connFlowMap) {
        const totalProduction = component.ports
          .filter((p) => p.type === 'output')
          .reduce((sum, p) => sum + p.rate, 0);

        connFlowMap = {};
        if (totalProduction < EPSILON) {
          component.connections.forEach((conn) => {
            connFlowMap![conn.id] = 0;
          });
        } else {
          const network = buildFlowNetwork(component.connections, totalProduction);
          const { connectionFlows } = dinic(network);

          component.connections.forEach((conn, idx) => {
            connFlowMap![conn.id] = connectionFlows[idx] ?? 0;
          });
        }

        if (!bypassCache) {
          flowCache.set(componentHash, {
            connectionFlows: connFlowMap,
          });
        }
      }

      for (const conn of component.connections) {
        const flowRate = connFlowMap[conn.id] ?? 0;
        edgeFlows[conn.id] = flowRate;

        const sourceResult = results.get(conn.sourceNodeId);
        if (sourceResult && sourceResult.outputFlows[conn.sourceOutputIndex]) {
          sourceResult.outputFlows[conn.sourceOutputIndex].connected += flowRate;
        }

        const targetResult = results.get(conn.targetNodeId);
        if (targetResult && targetResult.inputFlows[conn.targetInputIndex]) {
          targetResult.inputFlows[conn.targetInputIndex].connected += flowRate;
        }
      }
    }
  }

  for (const [, nodeResult] of results) {
    for (const inputFlow of nodeResult.inputFlows) {
      inputFlow.rate = clampFlow(inputFlow.rate);
      inputFlow.connected = clampFlow(inputFlow.connected);
      inputFlow.hasDeficiency = inputFlow.rate > 0 && inputFlow.connected < inputFlow.rate - 1e-8;
      inputFlow.hasExcess = false;
    }
    for (const outputFlow of nodeResult.outputFlows) {
      outputFlow.rate = clampFlow(outputFlow.rate);
      outputFlow.connected = clampFlow(outputFlow.connected);
      outputFlow.hasExcess = outputFlow.rate > 0 && outputFlow.connected < outputFlow.rate - 1e-8;
      outputFlow.hasDeficiency = false;
    }
  }

  return { results, edgeFlows };
}

export function calculateFlows(
  graph: SolverGraph,
  bypassCache = false,
): {
  results: FlowResults;
  edgeFlows: Record<string, number>;
} {
  return runFlowPass(graph, bypassCache);
}

export function clearFlowCache(): void {
  flowCache.clear();
}
