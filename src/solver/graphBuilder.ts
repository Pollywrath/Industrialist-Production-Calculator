import type { ReactFlowNode, ReactFlowEdge, SolverGraph, SolverConnection } from '../types/solver';
import { getRecipe } from '../data/lookup';
import { getRateMultiplier } from '../utils/recipeComputation';
import { parseHandleId } from '../utils/idGenerator';

export function buildSolverGraph(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): SolverGraph {
  const graph: SolverGraph = { nodes: {}, products: {} };

  for (const node of nodes) {
    const data = node.data;
    const recipe = getRecipe(data.recipeId);
    if (!recipe) continue;

    const multiplier = getRateMultiplier(recipe.cycle_time, 'second');
    const machineCount = data.machineCount ?? 1;

    const inputs = recipe.inputs.map((inp) => ({
      productId: inp.product_id,
      rate: inp.quantity * machineCount * multiplier,
    }));

    const outputs = recipe.outputs.map((out) => ({
      productId: out.product_id,
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
