import type {
  SolverGraph,
  SolverProductData,
  SolverPort,
  SolverConnection,
  FlowEdge,
  FlowNetwork,
  FlowResults,
} from './types';
import { clampFlow, EPSILON } from '../utils/precision';

// ── LRU Cache ───────────────────────────────────────────────

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

// ── Union-Find ──────────────────────────────────────────────

class UnionFind {
  parent: Int32Array;
  rank: Int32Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    this.rank = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      this.parent[i] = i;
    }
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;
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

// ── Circular Queue ──────────────────────────────────────────

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

// ── Connected components ────────────────────────────────────

interface Component {
  ports: SolverPort[];
  connections: SolverConnection[];
}

// ── Port Key Generation Utilities ───────────────────────────

function getPortKey(port: SolverPort): string {
  const prefix = port.type === 'input' ? 'in' : 'out';
  return `${prefix}:${port.nodeId}:${port.index}`;
}

function getSourceKey(conn: SolverConnection): string {
  return `out:${conn.sourceNodeId}:${conn.sourceOutputIndex}`;
}

function getTargetKey(conn: SolverConnection): string {
  return `in:${conn.targetNodeId}:${conn.targetInputIndex}`;
}

// ── Connected components ────────────────────────────────────

function findConnectedComponents(productData: SolverProductData) {
  const ports: SolverPort[] = [];
  const portToIndex = new Map<string, number>();

  for (const producer of productData.producers) {
    const portKey = getPortKey(producer);
    if (!portToIndex.has(portKey)) {
      portToIndex.set(portKey, ports.length);
      ports.push(producer);
    }
  }

  for (const consumer of productData.consumers) {
    const portKey = getPortKey(consumer);
    if (!portToIndex.has(portKey)) {
      portToIndex.set(portKey, ports.length);
      ports.push(consumer);
    }
  }

  const uf = new UnionFind(ports.length);

  for (const conn of productData.connections) {
    const sourceKey = getSourceKey(conn);
    const targetKey = getTargetKey(conn);
    const sourceIdx = portToIndex.get(sourceKey);
    const targetIdx = portToIndex.get(targetKey);
    if (sourceIdx !== undefined && targetIdx !== undefined) {
      uf.union(sourceIdx, targetIdx);
    }
  }

  const componentMap = new Map<number, number[]>();
  for (let i = 0; i < ports.length; i++) {
    const root = uf.find(i);
    if (!componentMap.has(root)) componentMap.set(root, []);
    componentMap.get(root)!.push(i);
  }

  const componentsByRoot = new Map<number, Component>();
  componentMap.forEach((portIndices, root) => {
    const component: Component = {
      ports: portIndices.map((idx) => ports[idx]),
      connections: [],
    };
    componentsByRoot.set(root, component);
  });

  for (const conn of productData.connections) {
    const sourceKey = getSourceKey(conn);
    const sourceIdx = portToIndex.get(sourceKey);
    if (sourceIdx !== undefined) {
      const root = uf.find(sourceIdx);
      const component = componentsByRoot.get(root);
      if (component) {
        component.connections.push(conn);
      }
    }
  }

  const components = Array.from(componentsByRoot.values());

  return { components, portToIndex };
}

// ── Hash a component for caching ────────────────────────────

function hashComponent(component: Component): string {
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

// ── Build flow network ──────────────────────────────────────

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
    const sourceKey = getSourceKey(conn);
    const targetKey = getTargetKey(conn);
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
    const sourceKey = getSourceKey(conn);
    const targetKey = getTargetKey(conn);
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
    for (let i = iter[u]; i < adjU.length; i++) {
      iter[u] = i;
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

// ── Main solver entry point ─────────────────────────────────

const flowCache = new LRUCache<{
  connectionFlows: Record<string, number>;
}>(1000);

export function calculateFlows(graph: SolverGraph): FlowResults {
  const results: FlowResults = new Map();

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
    if (productData.connections.length === 0) continue;

    const { components } = findConnectedComponents(productData);

    for (const component of components) {
      if (component.connections.length === 0) continue;

      const componentHash = hashComponent(component);
      const cacheKey = componentHash;
      const cached = flowCache.get(cacheKey);

      let connFlowMap: Record<string, number>;

      if (cached) {
        connFlowMap = cached.connectionFlows;
      } else {
        const totalProduction = component.ports
          .filter((p) => p.type === 'output')
          .reduce((sum, p) => sum + p.rate, 0);

        connFlowMap = {};
        if (totalProduction < EPSILON) {
          component.connections.forEach((conn) => {
            connFlowMap[conn.id] = 0;
          });
        } else {
          const network = buildFlowNetwork(component.connections, totalProduction);
          const { connectionFlows } = dinic(network);

          component.connections.forEach((conn, idx) => {
            connFlowMap[conn.id] = connectionFlows[idx] ?? 0;
          });
        }

        flowCache.set(cacheKey, {
          connectionFlows: connFlowMap,
        });
      }

      for (const conn of component.connections) {
        const flowRate = connFlowMap[conn.id] ?? 0;

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
      inputFlow.hasDeficiency =
        inputFlow.rate > 0 && inputFlow.connected < inputFlow.rate - EPSILON;
      inputFlow.hasExcess = false;
    }
    for (const outputFlow of nodeResult.outputFlows) {
      outputFlow.rate = clampFlow(outputFlow.rate);
      outputFlow.connected = clampFlow(outputFlow.connected);
      outputFlow.hasExcess =
        outputFlow.rate > 0 && outputFlow.connected < outputFlow.rate - EPSILON;
      outputFlow.hasDeficiency = false;
    }
  }

  return results;
}

export function clearFlowCache(): void {
  flowCache.clear();
}
