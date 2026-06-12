import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { isRecipeNode } from '../../../types/nodes';
import type { CanvasNode, HandleRef } from '../../../types/nodes';
import type { Recipe } from '../../../types/data';
import type { NodeFlowResult } from '../../../types/solver';
import { getProductName, resolveActiveRecipe } from '../../../data/lookup';
import { useUIStore, getEffectiveToggleId } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
import {
  getNormalizedCycleTime,
  calculateMachineCountFromRate,
  getRateMultiplier,
} from '../../../utils/recipeComputation';
import { formatQuantity } from '../../../utils/unitFormatting';
import { buildHandleId, parseHandleId } from '../../../utils/idGenerator';
import { calculateBalancedRate } from '../../../solver/systemicBalancer';
import styles from './RecipeNode.module.css';
import { useShallow } from 'zustand/react/shallow';
import {
  NODE_WIDTH,
  SIDE_PADDING,
  COLUMN_GAP,
  RECT_HEIGHT,
  RECT_GAP,
} from '../../shared/layoutConstants';

interface GroupNodeIOProps {
  nodeId: string;
  inputProxyHandleIds: string[];
  outputProxyHandleIds: string[];
}

type ProxyFlowValue = NodeFlowResult | Recipe | string | undefined;

interface GroupNodeIORectProps {
  refVal: HandleRef;
  width: number;
  label: string;
  totalQty: number;
  onClick: (ref: HandleRef) => void;
}

function GroupNodeIORect({
  refVal,
  width,
  label,
  totalQty,
  onClick,
}: GroupNodeIORectProps) {
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

interface GroupNodeIOHandleProps {
  refVal: HandleRef;
  nodeId: string;
  isFlipped: boolean;
  top: number;
  position: Position;
  onSquareClick: (e: React.MouseEvent, handleId: string) => void;
  onDoubleClick: (ref: HandleRef) => void;
}

function GroupNodeIOHandle({
  refVal,
  nodeId,
  isFlipped,
  top,
  position,
  onSquareClick,
  onDoubleClick,
}: GroupNodeIOHandleProps) {
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

export function GroupNodeIO({
  nodeId,
  inputProxyHandleIds,
  outputProxyHandleIds,
}: GroupNodeIOProps) {
  const rateMode = useUIStore((s) => s.rateMode);
  const proxyNodes = useFlowStore(
    useShallow((s): Array<CanvasNode | undefined> => {
      const values: Array<CanvasNode | undefined> = [];
      const appendNodeForHandle = (handleId: string): void => {
        const parsed = parseHandleId(handleId);
        values.push(parsed ? s.nodesMap.get(parsed.nodeId) : undefined);
      };

      for (let i = 0; i < inputProxyHandleIds.length; i++) {
        appendNodeForHandle(inputProxyHandleIds[i]);
      }
      for (let i = 0; i < outputProxyHandleIds.length; i++) {
        appendNodeForHandle(outputProxyHandleIds[i]);
      }
      return values;
    }),
  );
  const proxyFlowData = useFlowResultStore(
    useShallow((s): ProxyFlowValue[] => {
      const values: ProxyFlowValue[] = [];
      const appendFlowForHandle = (handleId: string): void => {
        const parsed = parseHandleId(handleId);
        const recipe = parsed ? s.nodeRecipes[parsed.nodeId] : undefined;
        const fallbackProduct =
          parsed && recipe
            ? (parsed.side === 'input' ? recipe.inputs : recipe.outputs)[parsed.index]?.product_id
            : undefined;
        values.push(
          parsed ? s.results.get(parsed.nodeId) : undefined,
          recipe,
          s.resolvedProducts[handleId] ?? fallbackProduct ?? '',
        );
      };

      for (let i = 0; i < inputProxyHandleIds.length; i++) {
        appendFlowForHandle(inputProxyHandleIds[i]);
      }
      for (let i = 0; i < outputProxyHandleIds.length; i++) {
        appendFlowForHandle(outputProxyHandleIds[i]);
      }
      return values;
    }),
  );

  const leftHandles = inputProxyHandleIds.map((_, index) => ({ side: 'input' as const, index }));
  const rightHandles = outputProxyHandleIds.map((_, index) => ({ side: 'output' as const, index }));

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

  const getProxyIndex = (ref: HandleRef): number =>
    ref.side === 'input' ? ref.index : inputProxyHandleIds.length + ref.index;

  const handleRectClick = (ref: HandleRef) => {
    const internalHandleId =
      ref.side === 'input'
        ? inputProxyHandleIds[ref.index]
        : outputProxyHandleIds[ref.index];
    if (!internalHandleId) return;

    const parsed = parseHandleId(internalHandleId);
    if (!parsed) return;

    const internalNode = useFlowStore.getState().nodesMap.get(parsed.nodeId);
    if (!isRecipeNode(internalNode)) return;

    const flowResultState = useFlowResultStore.getState();
    const recipe =
      flowResultState.nodeRecipes[internalNode.id] ??
      resolveActiveRecipe(
        internalNode.data.recipeId,
        internalNode.data.settings,
        internalNode.id,
      );
    if (!recipe) return;

    const list = parsed.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[parsed.index];
    if (entry) {
      const resolvedProductId = flowResultState.resolvedProducts[internalHandleId] ?? '';
      const concreteProductId =
        resolvedProductId && resolvedProductId !== 'any_fluid' && resolvedProductId !== 'any_item'
          ? resolvedProductId
          : null;

      const isPlaceholder = entry.product_id === 'any_fluid' || entry.product_id === 'any_item';
      const productIdToPass = concreteProductId ?? (isPlaceholder ? null : entry.product_id);

      useUIStore
        .getState()
        .setRecipeSelectorOpen(true, productIdToPass, parsed.side, parsed.nodeId, parsed.index);
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
    const { nodes, edges, nodesMap: latestNodesMap } = useFlowStore.getState();
    const internalHandleId =
      ref.side === 'input'
        ? inputProxyHandleIds[ref.index]
        : outputProxyHandleIds[ref.index];
    if (!internalHandleId) return;

    const parsed = parseHandleId(internalHandleId);
    if (!parsed) return;

    const internalNode = latestNodesMap.get(parsed.nodeId);
    if (!isRecipeNode(internalNode)) return;

    const flowResultState = useFlowResultStore.getState();
    const recipe =
      flowResultState.nodeRecipes[internalNode.id] ??
      resolveActiveRecipe(internalNode.data.recipeId, internalNode.data.settings, internalNode.id);
    if (!recipe) return;

    const recipeNodes = nodes.filter(isRecipeNode);
    const recipeNodeIds = new Set(recipeNodes.map((n) => n.id));
    const recipeEdges = edges.filter(
      (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
    );

    const hasEdges = recipeEdges.some(
      (edge) => edge.sourceHandle === internalHandleId || edge.targetHandle === internalHandleId,
    );
    if (!hasEdges) return;

    const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<string, unknown>;
    const targetRate = calculateBalancedRate(
      parsed.nodeId,
      parsed,
      recipe,
      recipeNodes,
      recipeEdges,
      flowResultState.results,
      flowResultState.resolvedProducts,
      globalSettings,
    );

    const list = parsed.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[parsed.index];
    const q = entry ? entry.quantity : 0;
    if (q <= 0) return;

    const newMachineCount = calculateMachineCountFromRate(targetRate, recipe.cycle_time, q);
    useFlowStore.getState().updateNodeData(parsed.nodeId, { machineCount: newMachineCount });
  };

  const getProxyFlowInfo = (ref: HandleRef) => {
    const internalHandleId =
      ref.side === 'input' ? inputProxyHandleIds[ref.index] : outputProxyHandleIds[ref.index];
    if (!internalHandleId) {
      return { label: 'Invalid', rate: 0, isFlipped: false };
    }

    const parsed = parseHandleId(internalHandleId);
    if (!parsed) {
      return { label: 'Invalid', rate: 0, isFlipped: false };
    }

    const proxyIndex = getProxyIndex(ref);
    const internalNode = proxyNodes[proxyIndex];
    if (!isRecipeNode(internalNode)) {
      return { label: 'Invalid', rate: 0, isFlipped: false };
    }

    const flowDataIndex = proxyIndex * 3;
    const flowResult = proxyFlowData[flowDataIndex] as NodeFlowResult | undefined;
    const recipe = proxyFlowData[flowDataIndex + 1] as Recipe | undefined;
    const scaleFactor = recipe ? getNormalizedCycleTime(recipe.cycle_time, rateMode) : 1;

    const resolvedProduct = (proxyFlowData[flowDataIndex + 2] as string | undefined) ?? '';
    const label = getProductName(resolvedProduct);

    const list = parsed.side === 'input' ? recipe?.inputs : recipe?.outputs;
    const entry = list?.[parsed.index];
    const isVariable = !!entry?.variable;

    const actualFlow = flowResult
      ? ((parsed.side === 'input'
          ? flowResult.inputFlows[parsed.index]?.connected
          : flowResult.outputFlows[parsed.index]?.connected) ?? 0)
      : 0;

    let rate = 0;
    if (isVariable) {
      rate = actualFlow * scaleFactor;
    } else if (recipe) {
      const qty = entry ? entry.quantity : 0;
      const machineCount = internalNode.data.machineCount ?? 0;
      const multiplier = getRateMultiplier(recipe.cycle_time, rateMode);
      rate = qty * machineCount * multiplier;
    }

    let isFlipped = false;
    if (flowResult && !isVariable) {
      if (parsed.side === 'input') {
        isFlipped = flowResult.inputFlows[parsed.index]?.hasDeficiency ?? false;
      } else {
        isFlipped = flowResult.outputFlows[parsed.index]?.hasExcess ?? false;
      }
    }

    return {
      label,
      rate,
      isFlipped,
    };
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
            {leftHandles.map((refVal) => {
              const info = getProxyFlowInfo(refVal);
              return (
                <GroupNodeIORect
                  key={`left-${refVal.index}`}
                  refVal={refVal}
                  width={leftWidth}
                  label={info.label}
                  totalQty={info.rate}
                  onClick={handleRectClick}
                />
              );
            })}
          </div>
        )}

        {hasLeft && hasRight && <div />}

        {hasRight && (
          <div
            className={`${styles['recipe-node-io__column']} ${styles['recipe-node-io__column--right']}`}
          >
            {rightHandles.map((refVal) => {
              const info = getProxyFlowInfo(refVal);
              return (
                <GroupNodeIORect
                  key={`right-${refVal.index}`}
                  refVal={refVal}
                  width={rightWidth}
                  label={info.label}
                  totalQty={info.rate}
                  onClick={handleRectClick}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className={styles['recipe-node-io__handles']}>
        {leftHandles.map((refVal, i) => {
          const verticalOffset = ((maxCount - leftCount) * (RECT_HEIGHT + RECT_GAP)) / 2;
          const top = 17 + verticalOffset + i * (RECT_HEIGHT + RECT_GAP) + RECT_HEIGHT / 2;
          const info = getProxyFlowInfo(refVal);

          return (
            <GroupNodeIOHandle
              key={`L-${refVal.index}`}
              refVal={refVal}
              nodeId={nodeId}
              isFlipped={info.isFlipped}
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
          const info = getProxyFlowInfo(refVal);

          return (
            <GroupNodeIOHandle
              key={`R-${refVal.index}`}
              refVal={refVal}
              nodeId={nodeId}
              isFlipped={info.isFlipped}
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
