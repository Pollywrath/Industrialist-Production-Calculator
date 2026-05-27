import { useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Edge,
  type Connection,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RecipeNode } from './nodes/RecipeNode';
import { RecipeEdge } from './edges/RecipeEdge';
import { getProduct } from '../../data/lookup';
import { createGraphResolutionContext } from '../../utils/graphResolutionContext';
import { useFlowStore } from '../../stores/useFlowStore';
import { useUIStore, getEffectiveToggleId } from '../../stores/useUIStore';
import { useFlowSolver } from '../../hooks/useFlowSolver';
import { parseHandleId } from '../../utils/idGenerator';
import { SNAP_GRID, GRID_DOT_SIZE } from '../shared/layoutConstants';

const nodeTypes = {
  recipe: RecipeNode,
};
const edgeTypes = {
  recipe: RecipeEdge,
};

const onEdgeClick = (_event: React.MouseEvent, edge: Edge) => {
  const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
  if (isDeleteMode) {
    const flowStore = useFlowStore.getState();
    flowStore.setEdges(flowStore.edges.filter((e) => e.id !== edge.id));
  }
};

const onNodeClick = (_event: React.MouseEvent, node: Node) => {
  const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
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

  const store = useFlowStore.getState();
  const resolutionContext = createGraphResolutionContext(store.nodes, store.edges);
  const sourceHelpers = resolutionContext.createHelpers(connection.source);
  const targetHelpers = resolutionContext.createHelpers(connection.target);
  const resolvedSourceProductId =
    store.resolvedProducts[connection.sourceHandle] ?? sourceHelpers.resolveProduct('output', sourceParsed.index);
  const resolvedTargetProductId =
    store.resolvedProducts[connection.targetHandle] ?? targetHelpers.resolveProduct('input', targetParsed.index);

  const sourceProdObj = getProduct(resolvedSourceProductId);
  const targetProdObj = getProduct(resolvedTargetProductId);

  if (!sourceProdObj || !targetProdObj) return false;

  if (resolvedSourceProductId === resolvedTargetProductId) return true;

  const isSourceAny =
    resolvedSourceProductId === 'any_fluid' || resolvedSourceProductId === 'any_item';
  const isTargetAny =
    resolvedTargetProductId === 'any_fluid' || resolvedTargetProductId === 'any_item';

  if (isSourceAny || isTargetAny) {
    return sourceProdObj.type === targetProdObj.type;
  }

  return false;
};

interface FlowViewportCanvasProps {
  isZoomedOut: boolean;
}

function FlowViewportCanvas({ isZoomedOut }: FlowViewportCanvasProps) {
  const nodes = useFlowStore((s) => s.nodes);
  const edges = useFlowStore((s) => s.edges);
  const onNodesChange = useFlowStore((s) => s.onNodesChange);
  const onEdgesChange = useFlowStore((s) => s.onEdgesChange);
  const onConnect = useFlowStore((s) => s.onConnect);

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
      onMove={(_e, viewport) => {
        const nextZoomedOut = viewport.zoom < 0.35;
        if (nextZoomedOut !== useUIStore.getState().isZoomedOut) {
          useUIStore.getState().setIsZoomedOut(nextZoomedOut);
        }
      }}
      onMoveStart={() => useUIStore.getState().setIsTransforming(true)}
      onMoveEnd={() => useUIStore.getState().setIsTransforming(false)}
      onlyRenderVisibleElements={nodes.length > 250 && !isZoomedOut}
      deleteKeyCode={null}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={SNAP_GRID}
        size={GRID_DOT_SIZE}
        color="var(--theme-color-grid-dots)"
      />
    </ReactFlow>
  );
}

export function FlowViewport() {
  const isZoomedOut = useUIStore((s) => s.isZoomedOut);

  useFlowSolver();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const uiStore = useUIStore.getState();
      if (uiStore.isRecipeSelectorOpen) return;

      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isDragging = document.querySelector(
        '.react-flow__nodesselection-rect, .react-flow__connection-path, .react-flow__node.dragging',
      );
      if (isDragging) return;

      if (e.key === 'Alt') {
        e.preventDefault();
        uiStore.pushOverride('delete_mode');
      } else if (e.key === 'Control' || e.key === 'Meta') {
        e.preventDefault();
        uiStore.pushOverride('multi_select');
      } else if (e.key === 'Shift') {
        uiStore.pushOverride('target');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const uiStore = useUIStore.getState();
      if (uiStore.isRecipeSelectorOpen) return;

      if (e.key === 'Alt') {
        uiStore.popOverride('delete_mode');
      } else if (e.key === 'Control' || e.key === 'Meta') {
        uiStore.popOverride('multi_select');
      } else if (e.key === 'Shift') {
        uiStore.popOverride('target');
      }
    };

    const handleBlur = () => {
      useUIStore.setState({ temporaryOverrides: [] });
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

  return <FlowViewportCanvas isZoomedOut={isZoomedOut} />;
}
