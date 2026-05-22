import type { ReactFlowNode, ReactFlowEdge, SolverGraph, SolverConnection } from '../types/solver';
import { resolveActiveRecipe } from '../data/lookup';
import { getRateMultiplier } from '../utils/recipeComputation';
import { parseHandleId } from '../utils/idGenerator';
import { resolveHandleProduct, buildEdgeLookupMap } from '../utils/productResolver';

export function buildSolverGraph(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  settingsOverrides?: Record<string, Record<string, unknown>>,
): SolverGraph {
  const graph: SolverGraph = { nodes: {}, products: {} };
  const nodesMap = new Map<string, ReactFlowNode>(nodes.map((n) => [n.id, n]));
  const edgeLookup = buildEdgeLookupMap(edges);

  for (const node of nodes) {
    const data = node.data;
    const nodeOverrides = settingsOverrides?.[node.id];
    const settings = nodeOverrides || data.settings
      ? { ...data.settings, ...nodeOverrides }
      : undefined;
    const recipe = resolveActiveRecipe(data.recipeId, settings);
    if (!recipe) continue;

    const multiplier = getRateMultiplier(recipe.cycle_time, 'second');
    const machineCount = data.machineCount ?? 1;

    const inputs = recipe.inputs.map((inp, idx) => ({
      productId: resolveHandleProduct(node.id, 'input', idx, nodesMap, edgeLookup),
      rate: inp.quantity * machineCount * multiplier,
    }));

    const outputs = recipe.outputs.map((out, idx) => ({
      productId: resolveHandleProduct(node.id, 'output', idx, nodesMap, edgeLookup),
      rate: out.quantity * machineCount * multiplier,
    }));

    graph.nodes[node.id] = { inputs, outputs };

    for (let i = 0; i < outputs.length; i++) {
      const productId = outputs[i].productId;
      if (!graph.products[productId]) {
        graph.products[productId] = {
          producers: [],
          consumers: [],
          connections: [],
        };
      }
      graph.products[productId].producers.push({
        type: 'output',
        nodeId: node.id,
        index: i,
        rate: outputs[i].rate,
      });
    }

    for (let i = 0; i < inputs.length; i++) {
      const productId = inputs[i].productId;
      if (!graph.products[productId]) {
        graph.products[productId] = {
          producers: [],
          consumers: [],
          connections: [],
        };
      }
      graph.products[productId].consumers.push({
        type: 'input',
        nodeId: node.id,
        index: i,
        rate: inputs[i].rate,
      });
    }
  }

  for (const edge of edges) {
    if (!edge.sourceHandle || !edge.targetHandle) continue;

    const sourceParsed = parseHandleId(edge.sourceHandle);
    const targetParsed = parseHandleId(edge.targetHandle);
    if (!sourceParsed || !targetParsed) continue;

    const sourceOutputIndex = sourceParsed.index;
    const targetInputIndex = targetParsed.index;

    const sourceNode = graph.nodes[edge.source];
    const targetNode = graph.nodes[edge.target];
    if (!sourceNode || !targetNode) continue;

    const sourceOutput = sourceNode.outputs[sourceOutputIndex];
    const targetInput = targetNode.inputs[targetInputIndex];
    if (!sourceOutput || !targetInput) continue;

    if (sourceOutput.productId !== targetInput.productId) continue;

    const productId = sourceOutput.productId;
    if (!graph.products[productId]) {
      graph.products[productId] = {
        producers: [],
        consumers: [],
        connections: [],
      };
    }

    const conn: SolverConnection = {
      id: edge.id,
      sourceNodeId: edge.source,
      sourceOutputIndex,
      sourceRate: sourceOutput.rate,
      targetNodeId: edge.target,
      targetInputIndex,
      targetRate: targetInput.rate,
    };

    graph.products[productId].connections.push(conn);
  }

  return graph;
}
