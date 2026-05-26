import type { ReactFlowNode, ReactFlowEdge, SolverGraph, SolverConnection } from '../types/solver';
import { resolveActiveRecipe } from '../data/lookup';
import { getRateMultiplier } from '../utils/recipeComputation';
import { parseHandleId, buildHandleId } from '../utils/idGenerator';
import { resolveHandleProduct, buildEdgeLookupMap } from '../utils/productResolver';

export function buildSolverGraph(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  settingsOverrides?: Record<string, Record<string, unknown>>,
  resolvedEdgeFlows?: Record<string, number>,
): SolverGraph {
  const graph: SolverGraph = { nodes: {}, products: {} };
  const nodesMap = new Map<string, ReactFlowNode>(nodes.map((n) => [n.id, n]));
  const edgeLookup = buildEdgeLookupMap(edges);
  const cache = new Map<string, string>();

  // Per-node helper factory
  const makeHelpers = (nodeId: string, cache: Map<string, string>) => ({
    resolveProduct: (s: 'input' | 'output', idx: number) =>
      resolveHandleProduct(nodeId, s, idx, nodesMap, edgeLookup, new Set(), cache),
    hasConnection: (s: 'input' | 'output', idx: number) => {
      const handleId = buildHandleId(nodeId, s, idx);
      return (edgeLookup.get(handleId)?.length ?? 0) > 0;
    },
    getFlowRate: (s: 'input' | 'output', idx: number) => {
      const handleId = buildHandleId(nodeId, s, idx);
      const connectedEdges = edgeLookup.get(handleId) ?? [];

      if (resolvedEdgeFlows) {
        let resolvedTotalFlow = 0;
        for (const edge of connectedEdges) {
          resolvedTotalFlow += resolvedEdgeFlows[edge.id] ?? 0;
        }
        return resolvedTotalFlow;
      }

      let totalFlow = 0;
      for (const edge of connectedEdges) {
        if (s === 'input') {
          const sourceNode = nodesMap.get(edge.source);
          if (!sourceNode || !edge.sourceHandle) continue;
          const sourceParsed = parseHandleId(edge.sourceHandle);
          if (!sourceParsed) continue;
          const sourceHelpers = makeHelpers(sourceNode.id, cache);
          const sourceRecipe = resolveActiveRecipe(
            sourceNode.data.recipeId,
            sourceNode.data.settings,
            sourceNode.id,
            sourceHelpers,
            { suppressStoreTemperatureOverrides: true },
          );
          if (!sourceRecipe) continue;
          const sourceOutput = sourceRecipe.outputs[sourceParsed.index];
          if (!sourceOutput) continue;
          const sourceMultiplier = getRateMultiplier(sourceRecipe.cycle_time, 'second');
          const sourceRate = sourceOutput.quantity * (sourceNode.data.machineCount ?? 1) * sourceMultiplier;
          totalFlow += sourceRate;
        } else {
          const targetNode = nodesMap.get(edge.target);
          if (!targetNode || !edge.targetHandle) continue;
          const targetParsed = parseHandleId(edge.targetHandle);
          if (!targetParsed) continue;
          const targetHelpers = makeHelpers(targetNode.id, cache);
          const targetRecipe = resolveActiveRecipe(
            targetNode.data.recipeId,
            targetNode.data.settings,
            targetNode.id,
            targetHelpers,
            { suppressStoreTemperatureOverrides: true },
          );
          if (!targetRecipe) continue;
          const targetInput = targetRecipe.inputs[targetParsed.index];
          if (!targetInput) continue;
          const targetMultiplier = getRateMultiplier(targetRecipe.cycle_time, 'second');
          const targetRate = targetInput.quantity * (targetNode.data.machineCount ?? 1) * targetMultiplier;
          totalFlow += targetRate;
        }
      }
      return totalFlow;
    },
  });

  for (const node of nodes) {
    const data = node.data;
    const nodeOverrides = settingsOverrides?.[node.id];
    const settings =
      nodeOverrides || data.settings ? { ...data.settings, ...nodeOverrides } : undefined;
    const helpers = makeHelpers(node.id, cache);
    const recipe = resolveActiveRecipe(data.recipeId, settings, node.id, helpers, {
      suppressStoreTemperatureOverrides: true,
    });
    if (!recipe) continue;

    const multiplier = getRateMultiplier(recipe.cycle_time, 'second');
    const machineCount = data.machineCount ?? 1;

    const inputs = recipe.inputs.map((inp, idx) => {
      const hasConn = helpers.hasConnection('input', idx);
      const isVariable = !!inp.variable;
      const rate = isVariable && !hasConn ? 0 : inp.quantity * machineCount * multiplier;
      return {
        productId: resolveHandleProduct(node.id, 'input', idx, nodesMap, edgeLookup),
        rate,
      };
    });

    const outputs = recipe.outputs.map((out, idx) => {
      const hasConn = helpers.hasConnection('output', idx);
      const isVariable = !!out.variable;
      const rate = isVariable && !hasConn ? 0 : out.quantity * machineCount * multiplier;
      return {
        productId: resolveHandleProduct(node.id, 'output', idx, nodesMap, edgeLookup),
        rate,
      };
    });

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
