import { Handle, Position, useNodeConnections } from '@xyflow/react';
import type { HandleRef } from '../../../types/nodes';
import type { Recipe } from '../../../types/data';
import { getProductName } from '../../../data/lookup';
import { useUIStore, getEffectiveToggleId } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
import { getRateMultiplier, calculateMachineCountFromRate } from '../../../utils/recipeComputation';
import { formatQuantity } from '../../../utils/unitFormatting';
import { buildHandleId } from '../../../utils/idGenerator';
import { calculateBalancedRate } from '../../../solver/systemicBalancer';
import { resolveHandleProduct, buildEdgeLookupMap } from '../../../utils/productResolver';
import styles from './RecipeNode.module.css';

import {
  RECT_HEIGHT,
  RECT_GAP,
  SIDE_PADDING,
  COLUMN_GAP,
  NODE_WIDTH,
} from '../../shared/layoutConstants';

interface RecipeNodeIOProps {
  leftHandles: HandleRef[];
  rightHandles: HandleRef[];
  recipe: Recipe | undefined;
  nodeId: string;
  machineCount: number;
}
function resolveQuantity(ref: HandleRef, recipe: Recipe | undefined): number {
  if (!recipe) return 0;
  const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = list[ref.index];
  return entry ? entry.quantity : 0;
}

interface RecipeNodeIORectProps {
  refVal: HandleRef;
  nodeId: string;
  width: number;
  recipe: Recipe | undefined;
  machineCount: number;
  multiplier: number;
  onClick: (ref: HandleRef) => void;
}

function RecipeNodeIORect({
  refVal,
  nodeId,
  width,
  recipe,
  machineCount,
  multiplier,
  onClick,
}: RecipeNodeIORectProps) {
  const handleId = buildHandleId(nodeId, refVal.side, refVal.index);
  useNodeConnections({
    handleType: refVal.side === 'input' ? 'target' : 'source',
    handleId,
  });

  useFlowStore((s) => s.solverVersion);

  const { nodesMap, edges } = useFlowStore.getState();
  const edgeLookup = buildEdgeLookupMap(edges);
  const resolvedProductId = resolveHandleProduct(
    nodeId,
    refVal.side,
    refVal.index,
    nodesMap,
    edgeLookup,
  );

  const qty = resolveQuantity(refVal, recipe);
  const totalQty = qty * machineCount * multiplier;
  const label = getProductName(resolvedProductId);

  return (
    <div className={styles['recipe-node-io__rect-wrapper']}>
      <div
        className={`${styles['recipe-node-io__rect']} ${styles[`recipe-node-io__rect--${refVal.side}`]}`}
        style={{ '--rect-width': `${width}px` } as React.CSSProperties}
        onClick={(e) => {
          if (getEffectiveToggleId(useUIStore.getState()) === 'delete_mode') return;
          e.stopPropagation();
          onClick(refVal);
        }}
      >
        <span className={styles['recipe-node-io__rect-text']}>
          {formatQuantity(totalQty)}x {label}
        </span>
      </div>
    </div>
  );
}

interface RecipeNodeIOHandleProps {
  refVal: HandleRef;
  nodeId: string;
  isFlipped: boolean;
  top: number;
  position: Position;
  onSquareClick: (e: React.MouseEvent, handleId: string) => void;
  onDoubleClick: (ref: HandleRef) => void;
}

function RecipeNodeIOHandle({
  refVal,
  nodeId,
  isFlipped,
  top,
  position,
  onSquareClick,
  onDoubleClick,
}: RecipeNodeIOHandleProps) {
  const handleId = buildHandleId(nodeId, refVal.side, refVal.index);

  return (
    <Handle
      type={refVal.side === 'input' ? 'target' : 'source'}
      position={position}
      id={handleId}
      className={`${styles['recipe-node-io__handle']} ${styles[`recipe-node-io__handle--${refVal.side}`]}${
        isFlipped ? ` ${styles['recipe-node-io__handle--flipped']}` : ''
      }`}
      style={{
        top,
        width: 'var(--theme-handle-size)',
        height: 'var(--theme-handle-size)',
        position: 'var(--theme-handle-position)' as 'absolute',
        ...(refVal.side === 'input'
          ? { left: 'var(--theme-handle-left)', transform: 'var(--theme-handle-transform-left)' }
          : {
              right: 'var(--theme-handle-right)',
              transform: 'var(--theme-handle-transform-right)',
            }),
      }}
      onClick={(e) => onSquareClick(e, handleId)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(refVal);
      }}
    />
  );
}

export function RecipeNodeIO({
  leftHandles,
  rightHandles,
  recipe,
  nodeId,
  machineCount,
}: RecipeNodeIOProps) {
  const rateMode = useUIStore((s) => s.rateMode);
  const multiplier = recipe ? getRateMultiplier(recipe.cycle_time, rateMode) : 1;
  const flowResult = useFlowResultStore((s) => s.results.get(nodeId));

  const isFlipped = (ref: HandleRef): boolean => {
    if (!flowResult) return false;
    if (ref.side === 'input') {
      const status = flowResult.inputFlows[ref.index];
      return status ? status.hasDeficiency : false;
    } else {
      const status = flowResult.outputFlows[ref.index];
      return status ? status.hasExcess : false;
    }
  };

  const leftCount = leftHandles.length;
  const rightCount = rightHandles.length;
  const hasLeft = leftCount > 0;
  const hasRight = rightCount > 0;
  const maxCount = Math.max(leftCount, rightCount, 1);

  const availableWidth = NODE_WIDTH - SIDE_PADDING * 2;
  const leftWidth =
    hasLeft && hasRight
      ? Math.floor((availableWidth - COLUMN_GAP) / 2)
      : hasLeft
        ? availableWidth
        : 0;
  const rightWidth =
    hasLeft && hasRight
      ? Math.floor((availableWidth - COLUMN_GAP) / 2)
      : hasRight
        ? availableWidth
        : 0;

  const ioAreaHeight = maxCount * RECT_HEIGHT + (maxCount - 1) * RECT_GAP + 34;

  const gridTemplateColumns = hasLeft && hasRight ? `${leftWidth}px 1fr ${rightWidth}px` : '1fr';

  const handleRectClick = (ref: HandleRef) => {
    if (!recipe) return;
    const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[ref.index];
    if (entry) {
      const isPlaceholder = entry.product_id === 'any_fluid' || entry.product_id === 'any_item';
      useUIStore
        .getState()
        .setRecipeSelectorOpen(
          true,
          isPlaceholder ? null : entry.product_id,
          ref.side,
          nodeId,
          ref.index,
        );
    }
  };

  const handleSquareClick = (e: React.MouseEvent, handleId: string) => {
    const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
    if (isDeleteMode) {
      e.stopPropagation();
      useFlowStore.getState().deleteEdgesConnectedToHandle(handleId);
    }
  };

  const handleDoubleClick = (ref: HandleRef) => {
    if (!recipe) return;
    const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[ref.index];
    if (!entry) return;
    const handleId = buildHandleId(nodeId, ref.side, ref.index);
    const { nodes, edges } = useFlowStore.getState();
    const hasEdges = edges.some(
      (edge) => edge.sourceHandle === handleId || edge.targetHandle === handleId,
    );
    if (!hasEdges) return;

    const flowResults = useFlowResultStore.getState().results;

    const targetRate = calculateBalancedRate(nodeId, ref, recipe, nodes, edges, flowResults);
    const q = resolveQuantity(ref, recipe);
    if (q <= 0) return;
    const newMachineCount = calculateMachineCountFromRate(targetRate, recipe.cycle_time, q);
    useFlowStore.getState().updateNodeData(nodeId, { machineCount: newMachineCount });
  };

  return (
    <div
      className={styles['recipe-node-io']}
      style={{ '--io-area-height': `${ioAreaHeight}px` } as React.CSSProperties}
    >
      <div
        className={styles['recipe-node-io__columns']}
        style={
          {
            '--grid-template-columns': gridTemplateColumns,
            '--padding-horizontal': `${SIDE_PADDING}px`,
          } as React.CSSProperties
        }
      >
        {hasLeft && (
          <div
            className={`${styles['recipe-node-io__column']} ${styles['recipe-node-io__column--left']}`}
          >
            {leftHandles.map((refVal) => (
              <RecipeNodeIORect
                key={`left-${refVal.index}`}
                refVal={refVal}
                nodeId={nodeId}
                width={leftWidth}
                recipe={recipe}
                machineCount={machineCount}
                multiplier={multiplier}
                onClick={handleRectClick}
              />
            ))}
          </div>
        )}

        {hasLeft && hasRight && <div />}

        {hasRight && (
          <div
            className={`${styles['recipe-node-io__column']} ${styles['recipe-node-io__column--right']}`}
          >
            {rightHandles.map((refVal) => (
              <RecipeNodeIORect
                key={`right-${refVal.index}`}
                refVal={refVal}
                nodeId={nodeId}
                width={rightWidth}
                recipe={recipe}
                machineCount={machineCount}
                multiplier={multiplier}
                onClick={handleRectClick}
              />
            ))}
          </div>
        )}
      </div>

      <div className={styles['recipe-node-io__handles']}>
        {leftHandles.map((refVal, i) => {
          const verticalOffset = ((maxCount - leftCount) * (RECT_HEIGHT + RECT_GAP)) / 2;
          const top = 17 + verticalOffset + i * (RECT_HEIGHT + RECT_GAP) + RECT_HEIGHT / 2;

          return (
            <RecipeNodeIOHandle
              key={`L-${refVal.index}`}
              refVal={refVal}
              nodeId={nodeId}
              isFlipped={isFlipped(refVal)}
              top={top}
              position={Position.Left}
              onSquareClick={handleSquareClick}
              onDoubleClick={handleDoubleClick}
            />
          );
        })}

        {rightHandles.map((refVal, i) => {
          const verticalOffset = ((maxCount - rightCount) * (RECT_HEIGHT + RECT_GAP)) / 2;
          const top = 17 + verticalOffset + i * (RECT_HEIGHT + RECT_GAP) + RECT_HEIGHT / 2;

          return (
            <RecipeNodeIOHandle
              key={`R-${refVal.index}`}
              refVal={refVal}
              nodeId={nodeId}
              isFlipped={isFlipped(refVal)}
              top={top}
              position={Position.Right}
              onSquareClick={handleSquareClick}
              onDoubleClick={handleDoubleClick}
            />
          );
        })}
      </div>
    </div>
  );
}
