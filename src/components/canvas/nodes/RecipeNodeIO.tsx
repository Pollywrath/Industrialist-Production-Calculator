import { Handle, Position } from '@xyflow/react';
import type { HandleRef } from '../../../types/nodes';
import type { Recipe } from '../../../types/data';
import { getProductName } from '../../../data/lookup';
import useControlStore from '../../../stores/useControlStore';
import useFlowStore from '../../../stores/useFlowStore';
import useFlowResultStore from '../../../stores/useFlowResultStore';
import {
  getRateMultiplier,
  showQuantity,
  cleanMachineCount,
} from '../../../utils/recipeComputation';
import { buildHandleId } from '../../../utils/idGenerator';
import { calculateBalancedRate } from '../../../solver/systemicBalancer';
import styles from './RecipeNode.module.css';

import {
  RECT_HEIGHT,
  RECT_GAP,
  SIDE_PADDING,
  COLUMN_GAP,
  NODE_WIDTH,
} from './layoutConstants';

interface RecipeNodeIOProps {
  leftHandles: HandleRef[];
  rightHandles: HandleRef[];
  recipe: Recipe | undefined;
  nodeId: string;
  machineCount: number;
}

function resolveLabel(ref: HandleRef, recipe: Recipe | undefined): string {
  if (!recipe) return '???';
  const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = list[ref.index];
  return entry ? getProductName(entry.product_id) : '???';
}

function resolveQuantity(ref: HandleRef, recipe: Recipe | undefined): number {
  if (!recipe) return 0;
  const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = list[ref.index];
  return entry ? entry.quantity : 0;
}

export default function RecipeNodeIO({
  leftHandles,
  rightHandles,
  recipe,
  nodeId,
  machineCount,
}: RecipeNodeIOProps) {
  const rateMode = useControlStore((s) => s.rateMode);
  const isDeleteMode = useControlStore((s) => !!s.activeToggles['delete_mode']);
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
      useControlStore
        .getState()
        .setRecipeSelectorOpen(true, entry.product_id, ref.side, nodeId, ref.index);
    }
  };

  const handleSquareClick = (e: React.MouseEvent, handleId: string) => {
    if (isDeleteMode) {
      e.stopPropagation();
      const flowStore = useFlowStore.getState();
      const remainingEdges = flowStore.edges.filter(
        (edge) => edge.sourceHandle !== handleId && edge.targetHandle !== handleId,
      );
      flowStore.setEdges(remainingEdges);
    }
  };

  const handleDoubleClick = (ref: HandleRef) => {
    if (!recipe) return;
    const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[ref.index];
    if (!entry) return;
    const handleId = buildHandleId(nodeId, ref.side, ref.index);
    const flowStore = useFlowStore.getState();
    const hasEdges = flowStore.edges.some(
      (edge) => edge.sourceHandle === handleId || edge.targetHandle === handleId,
    );
    if (!hasEdges) return;

    const flowResults = useFlowResultStore.getState().results;

    const targetRate = calculateBalancedRate(
      nodeId,
      ref,
      recipe,
      flowStore.nodes,
      flowStore.edges,
      flowResults,
    );
    const q = resolveQuantity(ref, recipe);
    if (q <= 0) return;
    const newMachineCount = cleanMachineCount((targetRate * recipe.cycle_time) / q);
    flowStore.updateNodeData(nodeId, { machineCount: newMachineCount });
  };

  return (
    <div className={styles['recipe-node-io']} style={{ height: ioAreaHeight }}>
      <div
        className={styles['recipe-node-io__columns']}
        style={{
          gridTemplateColumns,
          padding: `0 ${SIDE_PADDING}px`,
        }}
      >
        {hasLeft && (
          <div
            className={`${styles['recipe-node-io__column']} ${styles['recipe-node-io__column--left']}`}
          >
            {leftHandles.map((ref, i) => (
              <div key={`left-${i}`} className={styles['recipe-node-io__rect-wrapper']}>
                <div
                  className={`${styles['recipe-node-io__rect']} ${styles[`recipe-node-io__rect--${ref.side}`]}`}
                  style={{
                    width: leftWidth,
                    height: RECT_HEIGHT,
                    minWidth: leftWidth,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    if (isDeleteMode) return;
                    e.stopPropagation();
                    handleRectClick(ref);
                  }}
                >
                  <span className={styles['recipe-node-io__rect-text']}>
                    {showQuantity(resolveQuantity(ref, recipe) * machineCount * multiplier)}x{' '}
                    {resolveLabel(ref, recipe)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasLeft && hasRight && <div />}

        {hasRight && (
          <div
            className={`${styles['recipe-node-io__column']} ${styles['recipe-node-io__column--right']}`}
          >
            {rightHandles.map((ref, i) => (
              <div key={`right-${i}`} className={styles['recipe-node-io__rect-wrapper']}>
                <div
                  className={`${styles['recipe-node-io__rect']} ${styles[`recipe-node-io__rect--${ref.side}`]}`}
                  style={{
                    width: rightWidth,
                    height: RECT_HEIGHT,
                    minWidth: rightWidth,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    if (isDeleteMode) return;
                    e.stopPropagation();
                    handleRectClick(ref);
                  }}
                >
                  <span className={styles['recipe-node-io__rect-text']}>
                    {showQuantity(resolveQuantity(ref, recipe) * machineCount * multiplier)}x{' '}
                    {resolveLabel(ref, recipe)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles['recipe-node-io__handles']}>
        {leftHandles.map((ref, i) => {
          const verticalOffset = ((maxCount - leftCount) * (RECT_HEIGHT + RECT_GAP)) / 2;
          const top = 17 + verticalOffset + i * (RECT_HEIGHT + RECT_GAP) + RECT_HEIGHT / 2;
          const handleId = buildHandleId(nodeId, ref.side, ref.index);

          return (
            <Handle
              key={`L-${i}`}
              type={ref.side === 'input' ? 'target' : 'source'}
              position={Position.Left}
              id={handleId}
              className={`${styles['recipe-node-io__handle']} ${styles[`recipe-node-io__handle--${ref.side}`]}${isFlipped(ref) ? ` ${styles['recipe-node-io__handle--flipped']}` : ''}`}
              style={{ top }}
              onClick={(e) => handleSquareClick(e, handleId)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleDoubleClick(ref);
              }}
            />
          );
        })}

        {rightHandles.map((ref, i) => {
          const verticalOffset = ((maxCount - rightCount) * (RECT_HEIGHT + RECT_GAP)) / 2;
          const top = 17 + verticalOffset + i * (RECT_HEIGHT + RECT_GAP) + RECT_HEIGHT / 2;
          const handleId = buildHandleId(nodeId, ref.side, ref.index);

          return (
            <Handle
              key={`R-${i}`}
              type={ref.side === 'input' ? 'target' : 'source'}
              position={Position.Right}
              id={handleId}
              className={`${styles['recipe-node-io__handle']} ${styles[`recipe-node-io__handle--${ref.side}`]}${isFlipped(ref) ? ` ${styles['recipe-node-io__handle--flipped']}` : ''}`}
              style={{ top }}
              onClick={(e) => handleSquareClick(e, handleId)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                handleDoubleClick(ref);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
