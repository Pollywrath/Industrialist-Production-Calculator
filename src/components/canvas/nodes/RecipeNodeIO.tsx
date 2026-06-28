import { Handle, Position } from '@xyflow/react';
import { isRecipeNode } from '../../../types/nodes';
import type { HandleRef } from '../../../types/nodes';
import type { HandleDataType, Recipe } from '../../../types/data';
import { getProduct, getProductName } from '../../../data/lookup';
import { useUIStore, getEffectiveToggleId } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
import { useDataStore } from '../../../stores/useDataStore';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
} from '../../../stores/useTutorialStore';
import {
  getRateMultiplier,
  calculateMachineCountFromRate,
  getNormalizedCycleTime,
} from '../../../utils/recipeComputation';
import { formatQuantity } from '../../../utils/unitFormatting';
import { buildHandleId } from '../../../utils/idGenerator';
import { calculateBalancedRate } from '../../../solver/systemicBalancer';
import {
  getRecipeEntryHandleType,
  getRecipeEntryProductId,
  productTypeToHandleDataType,
} from '../../../utils/handleTypes';
import styles from './RecipeNode.module.css';
import { useShallow } from 'zustand/react/shallow';

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

interface ProductLinkAnchor {
  ref: HandleRef;
  linkId: string;
  x: number;
  y: number;
}

interface ProductLinkLine {
  key: string;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const PRODUCT_LINK_LINE_STYLE: React.CSSProperties = {
  fill: 'none',
  stroke: 'var(--theme-color-info)',
  strokeWidth: 2,
  strokeDasharray: '5 4',
  strokeLinecap: 'square',
};

const PRODUCT_LINK_DOT_STYLE: React.CSSProperties = {
  fill: 'var(--theme-color-info)',
  stroke: 'var(--theme-color-node-bg)',
  strokeWidth: 1,
};

function getProductLinkId(ref: HandleRef, recipe: Recipe | undefined): string {
  if (!recipe) return '';
  const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
  const linkId = list[ref.index]?.product_link_id;
  return typeof linkId === 'string' ? linkId.trim() : '';
}

function createProductLinkAnchor(
  ref: HandleRef,
  ordinal: number,
  sideCount: number,
  maxCount: number,
  linkId: string,
  leftWidth: number,
  middleWidth: number,
): ProductLinkAnchor {
  const verticalOffset = ((maxCount - sideCount) * (RECT_HEIGHT + RECT_GAP)) / 2;
  const y = 17 + verticalOffset + ordinal * (RECT_HEIGHT + RECT_GAP) + RECT_HEIGHT / 2;
  const x =
    ref.side === 'input'
      ? SIDE_PADDING + leftWidth
      : SIDE_PADDING + leftWidth + middleWidth;

  return {
    ref,
    linkId,
    x,
    y,
  };
}

function buildProductLinkLines(
  recipe: Recipe | undefined,
  leftHandles: HandleRef[],
  rightHandles: HandleRef[],
  leftWidth: number,
  rightWidth: number,
  maxCount: number,
): ProductLinkLine[] {
  if (!recipe) return [];

  const middleWidth = NODE_WIDTH - SIDE_PADDING * 2 - leftWidth - rightWidth;
  const groups = new Map<string, ProductLinkAnchor[]>();

  const addAnchor = (
    ref: HandleRef,
    ordinal: number,
    sideCount: number,
  ) => {
    const linkId = getProductLinkId(ref, recipe);
    if (!linkId) return;

    const anchor = createProductLinkAnchor(
      ref,
      ordinal,
      sideCount,
      maxCount,
      linkId,
      leftWidth,
      middleWidth,
    );
    const group = groups.get(linkId);
    if (group) {
      group.push(anchor);
    } else {
      groups.set(linkId, [anchor]);
    }
  };

  for (let i = 0; i < leftHandles.length; i++) {
    addAnchor(leftHandles[i], i, leftHandles.length);
  }

  for (let i = 0; i < rightHandles.length; i++) {
    addAnchor(rightHandles[i], i, rightHandles.length);
  }

  const lines: ProductLinkLine[] = [];
  groups.forEach((anchors, linkId) => {
    if (anchors.length < 2) return;

    const inputs = anchors.filter((anchor) => anchor.ref.side === 'input');
    const outputs = anchors.filter((anchor) => anchor.ref.side === 'output');

    if (inputs.length > 0 && outputs.length > 0) {
      for (let i = 0; i < inputs.length; i++) {
        for (let j = 0; j < outputs.length; j++) {
          lines.push({
            key: `${linkId}-${inputs[i].ref.side}-${inputs[i].ref.index}-${outputs[j].ref.side}-${outputs[j].ref.index}`,
            label: linkId,
            x1: inputs[i].x,
            y1: inputs[i].y,
            x2: outputs[j].x,
            y2: outputs[j].y,
          });
        }
      }
      return;
    }

    for (let i = 1; i < anchors.length; i++) {
      lines.push({
        key: `${linkId}-${anchors[i - 1].ref.side}-${anchors[i - 1].ref.index}-${anchors[i].ref.side}-${anchors[i].ref.index}`,
        label: linkId,
        x1: anchors[i - 1].x,
        y1: anchors[i - 1].y,
        x2: anchors[i].x,
        y2: anchors[i].y,
      });
    }
  });

  return lines;
}

interface RecipeNodeIORectProps {
  refVal: HandleRef;
  width: number;
  recipe: Recipe | undefined;
  machineCount: number;
  multiplier: number;
  onClick: (ref: HandleRef) => void;
  label: string;
  actualFlow: number;
  nodeId: string;
}

function RecipeNodeIORect({
  refVal,
  width,
  recipe,
  machineCount,
  multiplier,
  onClick,
  label,
  actualFlow,
  nodeId,
}: RecipeNodeIORectProps) {
  const qty = resolveQuantity(refVal, recipe);
  const list = refVal.side === 'input' ? recipe?.inputs : recipe?.outputs;
  const entry = list?.[refVal.index];
  const isVariable = !!entry?.variable;
  const scale = entry?.independentOfMachineCount ? 1 : machineCount;
  const totalQty = isVariable ? actualFlow : qty * scale * multiplier;

  return (
    <div className={styles['recipe-node-io__rect-wrapper']}>
      <div
        className={`${styles['recipe-node-io__rect']} ${styles[`recipe-node-io__rect--${refVal.side}`]} nodrag`}
        style={{ '--rect-width': `${width}px` } as React.CSSProperties}
        data-tutorial-rect-node-id={nodeId}
        data-tutorial-rect-side={refVal.side}
        data-tutorial-rect-index={refVal.index}
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
  handleDataType: HandleDataType | '';
  onSquareClick: (e: React.MouseEvent, ref: HandleRef, handleId: string) => void;
  onDoubleClick: (ref: HandleRef) => void;
}

function RecipeNodeIOHandle({
  refVal,
  nodeId,
  isFlipped,
  top,
  position,
  handleDataType,
  onSquareClick,
  onDoubleClick,
}: RecipeNodeIOHandleProps) {
  const handleId = buildHandleId(nodeId, refVal.side, refVal.index);
  const handleTypeClass = handleDataType
    ? ` ${styles[`recipe-node-io__handle--${handleDataType}`]}`
    : '';
  const wrapperStyle = {
    top,
    ...(refVal.side === 'input'
      ? { left: 'var(--theme-handle-left)', transform: 'var(--theme-handle-transform-left)' }
      : {
          right: 'var(--theme-handle-right)',
          transform: 'var(--theme-handle-transform-right)',
        }),
  } as React.CSSProperties;

  return (
    <div className={styles['recipe-node-io__handle-shell']} style={wrapperStyle}>
      <Handle
        type={refVal.side === 'input' ? 'target' : 'source'}
        position={position}
        id={handleId}
        className={`${styles['recipe-node-io__handle']} ${styles[`recipe-node-io__handle--${refVal.side}`]}${
          isFlipped ? ` ${styles['recipe-node-io__handle--flipped']}` : ''
        }${handleTypeClass}`}
        data-handle-type={handleDataType || undefined}
        data-tutorial-handle-id={handleId}
        data-tutorial-handle-node-id={nodeId}
        data-tutorial-handle-side={refVal.side}
        data-tutorial-handle-index={refVal.index}
        style={{
          width: 'var(--theme-handle-size)',
          height: 'var(--theme-handle-size)',
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
        onClick={(e) => onSquareClick(e, refVal, handleId)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onDoubleClick(refVal);
        }}
      />
    </div>
  );
}

export function RecipeNodeIO({
  leftHandles,
  rightHandles,
  recipe,
  nodeId,
  machineCount,
}: RecipeNodeIOProps) {
  const dbVersion = useDataStore((s) => s.dbVersion);
  const rateMode = useUIStore((s) => s.rateMode);
  const multiplier = recipe ? getRateMultiplier(recipe.cycle_time, rateMode) : 1;
  const scaleFactor = recipe ? getNormalizedCycleTime(recipe.cycle_time, rateMode) : 1;
  const flowResult = useFlowResultStore((s) => s.results.get(nodeId));
  const flowResultGraphVersion = useFlowResultStore((s) => s.graphVersion);
  const flowResultDataDbVersion = useFlowResultStore((s) => s.dataDbVersion);
  const currentGraphVersion = useFlowStore((s) => s.graphVersion);
  const hasFreshSolveSnapshot =
    flowResultGraphVersion === currentGraphVersion &&
    flowResultDataDbVersion === dbVersion;
  const resolvedProducts = useFlowResultStore(
    useShallow((s) => {
      const all = s.resolvedProducts;
      const allHandles = [...leftHandles, ...rightHandles];
      const result: Record<string, string> = {};
      for (let i = 0; i < allHandles.length; i++) {
        const handleId = buildHandleId(nodeId, allHandles[i].side, allHandles[i].index);
        result[handleId] = all[handleId] ?? '';
      }
      return result;
    }),
  );

  const isFlipped = (ref: HandleRef): boolean => {
    if (!recipe) return false;
    const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[ref.index];
    if (entry?.variable) return false;

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
  const productLinkLines = buildProductLinkLines(
    recipe,
    leftHandles,
    rightHandles,
    leftWidth,
    rightWidth,
    maxCount,
  );

  const resolveHandleDataType = (ref: HandleRef): HandleDataType | '' => {
    const list = ref.side === 'input' ? recipe?.inputs : recipe?.outputs;
    const entry = list?.[ref.index];
    const override = getRecipeEntryHandleType(entry);
    if (override) return override;

    const handleId = buildHandleId(nodeId, ref.side, ref.index);
    const fallbackProductId = getRecipeEntryProductId(recipe, ref.side, ref.index) || '';
    const productId =
      (hasFreshSolveSnapshot ? resolvedProducts[handleId] : '') || fallbackProductId;
    return productTypeToHandleDataType(getProduct(productId)?.type) ?? '';
  };

  const handleRectClick = (ref: HandleRef) => {
    if (!recipe) return;
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({
        type: 'node-rect',
        nodeId,
        side: ref.side,
        index: ref.index,
      })
    ) {
      return;
    }

    const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[ref.index];
    if (entry) {
      const handleId = buildHandleId(nodeId, ref.side, ref.index);
      const resolvedProductId = resolvedProducts[handleId];
      const concreteProductId =
        resolvedProductId && resolvedProductId !== 'any_fluid' && resolvedProductId !== 'any_item'
          ? resolvedProductId
          : null;

      const isPlaceholder = entry.product_id === 'any_fluid' || entry.product_id === 'any_item';
      const productIdToPass = concreteProductId ?? (isPlaceholder ? null : entry.product_id);

      useUIStore
        .getState()
        .setRecipeSelectorOpen(true, productIdToPass, ref.side, nodeId, ref.index);
    }
  };

  const handleSquareClick = (e: React.MouseEvent, ref: HandleRef, handleId: string) => {
    if (isTutorialActive()) {
      e.stopPropagation();
      if (
        canPerformTutorialAction({
          type: 'node-rect',
          nodeId,
          side: ref.side,
          index: ref.index,
        })
      ) {
        handleRectClick(ref);
      }
      return;
    }

    const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
    if (isDeleteMode) {
      e.stopPropagation();
      useFlowStore.getState().deleteEdgesConnectedToHandle(handleId);
    }
  };

  const handleDoubleClick = (ref: HandleRef) => {
    if (!recipe) return;
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({
        type: 'node-handle-double',
        nodeId,
        side: ref.side,
        index: ref.index,
      })
    ) {
      return;
    }

    const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[ref.index];
    if (!entry) return;
    const handleId = buildHandleId(nodeId, ref.side, ref.index);
    const { nodes, edges } = useFlowStore.getState();
    const recipeNodes = nodes.filter(isRecipeNode);
    const recipeNodeIds = new Set(recipeNodes.map((node) => node.id));
    const recipeEdges = edges.filter(
      (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
    );
    const allResolvedProducts = useFlowResultStore.getState().resolvedProducts;
    const hasEdges = recipeEdges.some(
      (edge) => edge.sourceHandle === handleId || edge.targetHandle === handleId,
    );
    if (!hasEdges) return;

    const flowResults = useFlowResultStore.getState().results;
    const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<string, unknown>;

    const targetRate = calculateBalancedRate(
      nodeId,
      ref,
      recipe,
      recipeNodes,
      recipeEdges,
      flowResults,
      allResolvedProducts,
      globalSettings,
    );
    const q = resolveQuantity(ref, recipe);
    if (q <= 0) return;
    const newMachineCount = calculateMachineCountFromRate(targetRate, recipe.cycle_time, q);
    useFlowStore.getState().updateNodeData(nodeId, { machineCount: newMachineCount });
    completeTutorialAction({
      type: 'node-handle-double',
      nodeId,
      side: ref.side,
      index: ref.index,
    });
  };

  return (
    <div
      className={styles['recipe-node-io']}
      data-db-version={dbVersion}
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
              const handleId = buildHandleId(nodeId, refVal.side, refVal.index);
              const fallbackProductId = getRecipeEntryProductId(recipe, refVal.side, refVal.index) || '';
              const actualFlow = flowResult
                ? ((refVal.side === 'input'
                    ? flowResult.inputFlows[refVal.index]?.connected
                    : flowResult.outputFlows[refVal.index]?.connected) ?? 0)
                : 0;
              const actualFlowScaled = actualFlow * scaleFactor;
              const productId =
                (hasFreshSolveSnapshot ? resolvedProducts[handleId] : '') || fallbackProductId;
              const label = getProductName(productId);
              return (
                <RecipeNodeIORect
                  key={`left-${refVal.index}`}
                  refVal={refVal}
                  width={leftWidth}
                  recipe={recipe}
                  machineCount={machineCount}
                  multiplier={multiplier}
                  onClick={handleRectClick}
                  label={label}
                  actualFlow={actualFlowScaled}
                  nodeId={nodeId}
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
              const handleId = buildHandleId(nodeId, refVal.side, refVal.index);
              const fallbackProductId = getRecipeEntryProductId(recipe, refVal.side, refVal.index) || '';
              const actualFlow = flowResult
                ? ((refVal.side === 'input'
                    ? flowResult.inputFlows[refVal.index]?.connected
                    : flowResult.outputFlows[refVal.index]?.connected) ?? 0)
                : 0;
              const actualFlowScaled = actualFlow * scaleFactor;
              const productId =
                (hasFreshSolveSnapshot ? resolvedProducts[handleId] : '') || fallbackProductId;
              const label = getProductName(productId);
              return (
                <RecipeNodeIORect
                  key={`right-${refVal.index}`}
                  refVal={refVal}
                  width={rightWidth}
                  recipe={recipe}
                  machineCount={machineCount}
                  multiplier={multiplier}
                  onClick={handleRectClick}
                  label={label}
                  actualFlow={actualFlowScaled}
                  nodeId={nodeId}
                />
              );
            })}
          </div>
        )}
      </div>

      {productLinkLines.length > 0 && (
        <svg
          className={styles['recipe-node-io__link-lines']}
          width={NODE_WIDTH}
          height={ioAreaHeight}
          viewBox={`0 0 ${NODE_WIDTH} ${ioAreaHeight}`}
          aria-hidden="true"
          focusable="false"
        >
          {productLinkLines.map((line) => (
            <g key={line.key}>
              <title>{`Linked product: ${line.label}`}</title>
              <line
                className={styles['recipe-node-io__link-line']}
                x1={line.x1}
                y1={line.y1}
                x2={line.x2}
                y2={line.y2}
                style={PRODUCT_LINK_LINE_STYLE}
              />
              <circle
                className={styles['recipe-node-io__link-dot']}
                cx={line.x1}
                cy={line.y1}
                r="3"
                style={PRODUCT_LINK_DOT_STYLE}
              />
              <circle
                className={styles['recipe-node-io__link-dot']}
                cx={line.x2}
                cy={line.y2}
                r="3"
                style={PRODUCT_LINK_DOT_STYLE}
              />
            </g>
          ))}
        </svg>
      )}

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
              handleDataType={resolveHandleDataType(refVal)}
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
              handleDataType={resolveHandleDataType(refVal)}
              onSquareClick={handleSquareClick}
              onDoubleClick={handleDoubleClick}
            />
          );
        })}
      </div>
    </div>
  );
}
