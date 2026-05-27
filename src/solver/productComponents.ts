import type { SolverConnection, SolverPort, SolverProductData } from '../types/solver';

export interface ProductComponent {
  ports: SolverPort[];
  connections: SolverConnection[];
}

export function getProductPortKey(port: SolverPort): string {
  return `${port.nodeId}:${port.type}:${port.index}`;
}

export function getProductConnectionSourceKey(conn: SolverConnection): string {
  return `${conn.sourceNodeId}:output:${conn.sourceOutputIndex}`;
}

export function getProductConnectionTargetKey(conn: SolverConnection): string {
  return `${conn.targetNodeId}:input:${conn.targetInputIndex}`;
}

function createDisjointSet(size: number): { find: (x: number) => number; union: (x: number, y: number) => void } {
  const parent = new Int32Array(size);
  const rank = new Int32Array(size);

  for (let i = 0; i < size; i++) {
    parent[i] = i;
  }

  const find = (x: number): number => {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  };

  const union = (x: number, y: number): void => {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX === rootY) return;
    if (rank[rootX] < rank[rootY]) {
      parent[rootX] = rootY;
    } else if (rank[rootX] > rank[rootY]) {
      parent[rootY] = rootX;
    } else {
      parent[rootY] = rootX;
      rank[rootX]++;
    }
  };

  return { find, union };
}

export function findProductConnectedComponents(productData: SolverProductData): ProductComponent[] {
  const ports: SolverPort[] = [];
  const portIndexByKey = new Map<string, number>();

  for (let i = 0; i < productData.producers.length; i++) {
    const producer = productData.producers[i];
    const key = getProductPortKey(producer);
    if (!portIndexByKey.has(key)) {
      portIndexByKey.set(key, ports.length);
      ports.push(producer);
    }
  }

  for (let i = 0; i < productData.consumers.length; i++) {
    const consumer = productData.consumers[i];
    const key = getProductPortKey(consumer);
    if (!portIndexByKey.has(key)) {
      portIndexByKey.set(key, ports.length);
      ports.push(consumer);
    }
  }

  if (ports.length === 0) {
    return [];
  }

  const dsu = createDisjointSet(ports.length);

  for (let i = 0; i < productData.connections.length; i++) {
    const connection = productData.connections[i];
    const sourceIndex = portIndexByKey.get(getProductConnectionSourceKey(connection));
    const targetIndex = portIndexByKey.get(getProductConnectionTargetKey(connection));
    if (sourceIndex !== undefined && targetIndex !== undefined) {
      dsu.union(sourceIndex, targetIndex);
    }
  }

  const componentPortIndices = new Map<number, number[]>();
  for (let i = 0; i < ports.length; i++) {
    const root = dsu.find(i);
    const entries = componentPortIndices.get(root);
    if (entries) {
      entries.push(i);
    } else {
      componentPortIndices.set(root, [i]);
    }
  }

  const components = new Map<number, ProductComponent>();
  componentPortIndices.forEach((indices, root) => {
    components.set(root, {
      ports: indices.map((index) => ports[index]),
      connections: [],
    });
  });

  for (let i = 0; i < productData.connections.length; i++) {
    const connection = productData.connections[i];
    const sourceIndex = portIndexByKey.get(getProductConnectionSourceKey(connection));
    if (sourceIndex === undefined) continue;
    const root = dsu.find(sourceIndex);
    const component = components.get(root);
    if (component) {
      component.connections.push(connection);
    }
  }

  return Array.from(components.values());
}

export function componentHasHandle(
  component: ProductComponent,
  nodeId: string,
  side: 'input' | 'output',
  index: number,
): boolean {
  for (let i = 0; i < component.ports.length; i++) {
    const port = component.ports[i];
    if (port.nodeId === nodeId && port.type === side && port.index === index) {
      return true;
    }
  }
  return false;
}
