import type { ReactFlowNode, ReactFlowEdge, SolverGraph, SolverConnection } from '../types/solver';
import { resolveActiveRecipe } from '../data/lookup';
import { getRateMultiplier } from '../utils/recipeComputation';
import { parseHandleId, buildHandleId } from '../utils/idGenerator';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';

export function buildSolverGraph(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  settingsOverrides?: Record<string, Record<string, unknown>>,
  resolvedEdgeFlows?: Record<string, number>,
  globalSettings?: Record<string, unknown>,
): SolverGraph {
  const graph: SolverGraph = { nodes: {}, products: {} };
  const resolutionContext = createGraphResolutionContext(nodes, edges);
  const { nodesMap, edgeLookup } = resolutionContext;

  const makeHelpers = (nodeId: string) => {
    const baseHelpers = resolutionContext.createHelpers(nodeId);
    return {
      ...baseHelpers,
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
            const sourceHelpers = makeHelpers(sourceNode.id);
            const sourceRecipe = resolveActiveRecipe(
              sourceNode.data.recipeId,
              sourceNode.data.settings,
              sourceNode.id,
              sourceHelpers,
              { suppressStoreTemperatureOverrides: true, globalSettings },
            );
            if (!sourceRecipe) continue;
            const sourceOutput = sourceRecipe.outputs[sourceParsed.index];
            if (!sourceOutput) continue;
            const sourceMultiplier = getRateMultiplier(sourceRecipe.cycle_time, 'second');
            const sourceScale = sourceOutput.independentOfMachineCount ? 1 : (sourceNode.data.machineCount ?? 1);
            const sourceRate =
              sourceOutput.quantity * sourceScale * sourceMultiplier;
            totalFlow += sourceRate;
          } else {
            const targetNode = nodesMap.get(edge.target);
            if (!targetNode || !edge.targetHandle) continue;
            const targetParsed = parseHandleId(edge.targetHandle);
            if (!targetParsed) continue;
            const targetHelpers = makeHelpers(targetNode.id);
            const targetRecipe = resolveActiveRecipe(
              targetNode.data.recipeId,
              targetNode.data.settings,
              targetNode.id,
              targetHelpers,
              { suppressStoreTemperatureOverrides: true, globalSettings },
            );
            if (!targetRecipe) continue;
            const targetInput = targetRecipe.inputs[targetParsed.index];
            if (!targetInput) continue;
            const targetMultiplier = getRateMultiplier(targetRecipe.cycle_time, 'second');
            const targetScale = targetInput.independentOfMachineCount ? 1 : (targetNode.data.machineCount ?? 1);
            const targetRate =
              targetInput.quantity * targetScale * targetMultiplier;
            totalFlow += targetRate;
          }
        }
        return totalFlow;
      },
    };
  };

  for (const node of nodes) {
    const data = node.data;
    const nodeOverrides = settingsOverrides?.[node.id];
    const settings =
      nodeOverrides || data.settings ? { ...data.settings, ...nodeOverrides } : undefined;
    const helpers = makeHelpers(node.id);
    const recipe = resolveActiveRecipe(data.recipeId, settings, node.id, helpers, {
      suppressStoreTemperatureOverrides: true,
      globalSettings,
    });
    if (!recipe) continue;

    const multiplier = getRateMultiplier(recipe.cycle_time, 'second');
    const machineCount = data.machineCount ?? 1;

    const inputs = recipe.inputs.map((inp, idx) => {
      const hasConn = helpers.hasConnection('input', idx);
      const isVariable = !!inp.variable;
      const scale = inp.independentOfMachineCount ? 1 : machineCount;
      const rate = isVariable && !hasConn ? 0 : inp.quantity * scale * multiplier;
      return {
        productId: helpers.resolveProduct('input', idx),
        rate,
      };
    });

    const outputs = recipe.outputs.map((out, idx) => {
      const hasConn = helpers.hasConnection('output', idx);
      const isVariable = !!out.variable;
      const scale = out.independentOfMachineCount ? 1 : machineCount;
      const rate = isVariable && !hasConn ? 0 : out.quantity * scale * multiplier;
      return {
        productId: helpers.resolveProduct('output', idx),
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
