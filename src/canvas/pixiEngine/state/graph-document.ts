import { GraphStore } from './graph-store';
import { ViewportStore } from './viewport-store';
import type {
  GraphEdge,
  GraphNode,
  GraphState,
  LegacyGraphState,
  Viewport,
} from '../domain/graph/types';
import type { FlowGraphState } from '../domain/edges/flow/model';
import { defaultGraphTypeRegistry, type GraphTypeRegistry } from '../domain/graph/type-registry';

export interface GraphDocument<
  TNode extends GraphNode = GraphNode,
  TEdge extends GraphEdge = GraphEdge,
  TDefaults = unknown,
> {
  readonly version: 1;
  readonly graph: GraphState<TNode, TEdge, TDefaults>;
  readonly viewport: Viewport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGraphDocument<
  TNode extends GraphNode = GraphNode,
  TEdge extends GraphEdge = GraphEdge,
  TDefaults = unknown,
>(
  input: string | unknown,
  typeRegistry: GraphTypeRegistry = defaultGraphTypeRegistry,
): GraphDocument<TNode, TEdge, TDefaults> {
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input) as unknown;
    } catch (error) {
      throw new Error(
        `Invalid graph JSON: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !isRecord(value.graph) ||
    !isRecord(value.viewport)
  ) {
    throw new Error('Graph document must contain version 1, graph data, and viewport data.');
  }
  const rawGraph = value.graph;
  if (!Array.isArray(rawGraph.nodes) || !Array.isArray(rawGraph.edges)) {
    throw new Error('Graph document nodes and edges must be arrays.');
  }
  const viewport = new ViewportStore(value.viewport as unknown as Viewport).getState();
  try {
    const graph = new GraphStore(
      rawGraph as unknown as FlowGraphState | GraphState<GraphNode, GraphEdge> | LegacyGraphState,
      typeRegistry,
    ).toGraphState<TNode, TEdge>();
    return { version: 1, graph: graph as GraphState<TNode, TEdge, TDefaults>, viewport };
  } catch (error) {
    throw new Error(
      `Invalid graph data: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function serializeGraphDocument(graph: GraphStore, viewport: Viewport) {
  const document: GraphDocument<GraphNode, GraphEdge, unknown> = {
    version: 1,
    graph: graph.toGraphState<GraphNode, GraphEdge>(),
    viewport: new ViewportStore(viewport).getState(),
  };
  return JSON.stringify(document);
}

export function importGraphDocument(
  input: string | unknown,
  graph: GraphStore,
  camera: ViewportStore,
) {
  const document = parseGraphDocument(input, graph.typeRegistry);
  graph.replaceGraph(document.graph);
  camera.setViewport(document.viewport);
  return document;
}
