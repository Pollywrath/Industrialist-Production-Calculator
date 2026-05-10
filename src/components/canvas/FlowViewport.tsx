import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
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
import useControlStore, { getEffectiveToggleId } from '../../stores/useControlStore';
import { useFlowSolver } from '../../hooks/useFlowSolver';
import { parseHandleId } from '../../utils/idGenerator';
import { SNAP_GRID, GRID_DOT_SIZE } from '../shared/layoutConstants';

const nodeTypes = {
  recipe: RecipeNode,
};
const edgeTypes = {
  recipe: RecipeEdge,
};

// ── Static Module-Level Event Callbacks ──────────────────────────────────────

const onEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
  const isDeleteMode = getEffectiveToggleId(useControlStore.getState()) === 'delete_mode';
  if (isDeleteMode) {
    const flowStore = useFlowStore.getState();
    flowStore.setEdges(flowStore.edges.filter((e) => e.id !== edge.id));
  }
};

const onNodeClick = (_event: React.MouseEvent, node: Node) => {
  const isDeleteMode = getEffectiveToggleId(useControlStore.getState()) === 'delete_mode';
  if (isDeleteMode) {
    useFlowStore.getState().deleteNode(node.id);
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

  if (!sourceParsed || !targetParsed) {
    return false;
  }

  if (sourceParsed.side !== 'output' || targetParsed.side !== 'input') {
    return false;
  }

  const sourceIndex = sourceParsed.index;
  const targetIndex = targetParsed.index;

  const storeNodesMap = useFlowStore.getState().nodesMap;
  const sourceNode = storeNodesMap.get(connection.source);
  const targetNode = storeNodesMap.get(connection.target);

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

// ── FlowViewport Component ───────────────────────────────────────────────────

export default function FlowViewport() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useFlowStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
    }))
  );

  useFlowSolver();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const controlStore = useControlStore.getState();
      if (controlStore.isRecipeSelectorOpen) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isDragging = document.querySelector(
        '.react-flow__nodesselection-rect, .react-flow__connection-path, .react-flow__node.dragging'
      );
      if (isDragging) return;

      if (e.key === 'Alt') {
        e.preventDefault();
        controlStore.pushOverride('delete_mode');
      } else if (e.key === 'Control' || e.key === 'Meta') {
        e.preventDefault();
        controlStore.pushOverride('multi_select');
      } else if (e.key === 'Shift') {
        controlStore.pushOverride('target');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const controlStore = useControlStore.getState();
      if (controlStore.isRecipeSelectorOpen) return;

      if (e.key === 'Alt') {
        controlStore.popOverride('delete_mode');
      } else if (e.key === 'Control' || e.key === 'Meta') {
        controlStore.popOverride('multi_select');
      } else if (e.key === 'Shift') {
        controlStore.popOverride('target');
      }
    };

    const handleBlur = () => {
      useControlStore.setState({ temporaryOverrides: [] });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return (
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
      fitView={true}
      minZoom={0.15}
    >
      <Background variant={BackgroundVariant.Dots} gap={SNAP_GRID} size={GRID_DOT_SIZE} color="var(--theme-color-grid-dots)" />
    </ReactFlow>
  );
}
