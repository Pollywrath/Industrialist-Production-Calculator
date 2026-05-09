import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Edge,
  type Connection,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import RecipeNode from './nodes/RecipeNode';
import RecipeEdge from './edges/RecipeEdge';
import { getRecipe } from '../../data/lookup';
import type { RecipeNodeData } from '../../types/nodes';
import useFlowStore from '../../stores/useFlowStore';
import useControlStore from '../../stores/useControlStore';
import { useFlowSolver } from '../../hooks/useFlowSolver';
import ControlsTray from '../menu/ControlsTray';
import RecipeSelector from '../overlays/RecipeSelector';
import { parseHandleId } from '../../utils/idGenerator';

const nodeTypes = {
  recipe: RecipeNode,
};
const edgeTypes = {
  recipe: RecipeEdge,
};

const SNAP_GRID: [number, number] = [19, 13];

export default function FlowCanvas() {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);

  const isDeleteMode = useControlStore((s) => !!s.activeToggles['delete_mode']);

  useFlowSolver();

  const onEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
    if (isDeleteMode) {
      const flowStore = useFlowStore.getState();
      flowStore.setEdges(flowStore.edges.filter((e) => e.id !== edge.id));
    }
  };

  const onNodeClick = (_event: React.MouseEvent, node: Node) => {
    if (isDeleteMode) {
      const flowStore = useFlowStore.getState();
      flowStore.setNodes(flowStore.nodes.filter((n) => n.id !== node.id));
      flowStore.setEdges(
        flowStore.edges.filter((e) => e.source !== node.id && e.target !== node.id),
      );
    }
  };

  const isValidConnection = (connection: Connection | Edge) => {
    if (
      !connection.source ||
      !connection.target ||
      !connection.sourceHandle ||
      !connection.targetHandle
    )
      return false;

    const sourceParsed = parseHandleId(connection.sourceHandle);
    const targetParsed = parseHandleId(connection.targetHandle);

    if (sourceParsed.side !== 'output' || targetParsed.side !== 'input') {
      return false;
    }

    const sourceIndex = sourceParsed.index;
    const targetIndex = targetParsed.index;

    const storeNodes = useFlowStore.getState().nodes;
    const sourceNode = storeNodes.find((n) => n.id === connection.source);
    const targetNode = storeNodes.find((n) => n.id === connection.target);

    if (!sourceNode || !targetNode) return false;

    const sourceData = sourceNode.data as RecipeNodeData;
    const targetData = targetNode.data as RecipeNodeData;

    const sourceRecipe = getRecipe(sourceData.recipeId);
    const targetRecipe = getRecipe(targetData.recipeId);

    if (!sourceRecipe || !targetRecipe) return false;

    const sourceProduct = sourceRecipe.outputs[sourceIndex]?.product_id;
    const targetProduct = targetRecipe.inputs[targetIndex]?.product_id;

    return sourceProduct !== undefined && sourceProduct === targetProduct;
  };

  return (
    <div
      style={{ width: '100vw', height: '100dvh', background: '#121214' }}
      className={isDeleteMode ? 'is-delete-mode' : ''}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onNodeClick={onNodeClick}
        isValidConnection={isValidConnection}
        snapToGrid={true}
        snapGrid={SNAP_GRID}
        elevateNodesOnSelect={true}
        fitView
      >
        <Background variant={BackgroundVariant.Dots} gap={SNAP_GRID} size={1.5} color="#26262b" />
      </ReactFlow>
      <ControlsTray />
      <RecipeSelector />
    </div>
  );
}
