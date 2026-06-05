import type { Recipe } from '../../../types/data';
import type { RateMode } from '../../../types/ui';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { getProductName } from '../../../data/lookup';
import { useFlowStore } from '../../../stores/useFlowStore';
import { createGraphResolutionContext } from '../../../utils/graphResolutionContext';
import { isRecipeNode } from '../../../types/nodes';
import styles from './NodeEditor.module.css';
import { useNodeEditorStore } from './NodeEditorContext';

interface HandleRowProps {
  nodeId: string;
  recipe: Recipe;
  side: 'input' | 'output';
  index: number;
  listIdx: number;
  totalLength: number;
  multiplier: number;
  rateMode: RateMode;
}

const getRateSuffix = (rateMode: RateMode) => {
  switch (rateMode) {
    case 'second':
      return '/s';
    case 'minute':
      return '/m';
    case 'hour':
      return '/h';
    case 'raw':
    default:
      return '';
  }
};

export function HandleRow({
  nodeId,
  recipe,
  side,
  index,
  listIdx,
  totalLength,
  multiplier,
  rateMode,
}: HandleRowProps) {
  const currentQuantityStr = useNodeEditorStore((s) => s.qtyStrMap[`${side}-${index}`] ?? '');
  const handleMove = useNodeEditorStore((s) => s.handleMove);
  const handleQtyChange = useNodeEditorStore((s) => s.handleQtyChange);
  const handleQtyBlur = useNodeEditorStore((s) => s.handleQtyBlur);

  const list = side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = list[index];

  if (!entry) {
    return (
      <div className={`${styles['node-editor-item']} ${styles[`node-editor-item--${side}`]}`}>
        <div className={`${styles['node-editor-handle-label']} ${styles['is-stale']}`}>
          Stale / Invalid Handle
        </div>
        <div className={styles['node-editor-quantity-section']}>
          <span className={styles['node-editor-quantity-neutral']}>N/A</span>
        </div>
      </div>
    );
  }

  const { nodes, edges } = useFlowStore.getState();
  const recipeNodes = nodes.filter(isRecipeNode);
  const recipeNodeIds = new Set(recipeNodes.map((node) => node.id));
  const recipeEdges = edges.filter(
    (edge) => recipeNodeIds.has(edge.source) && recipeNodeIds.has(edge.target),
  );
  const resolutionContext = createGraphResolutionContext(recipeNodes, recipeEdges);
  const helpers = resolutionContext.createHelpers(nodeId);
  const resolvedProductId = helpers.resolveProduct(side, index);
  const name = getProductName(resolvedProductId);
  const baseQuantity = entry.quantity;
  const normalizedBaseQuantity = baseQuantity * multiplier;

  return (
    <div className={`${styles['node-editor-item']} ${styles[`node-editor-item--${side}`]}`}>
      <div className={styles['node-editor-actions']}>
        <div className={styles['node-editor-actions-stack']}>
          <button disabled={listIdx === 0} onClick={() => handleMove(side, listIdx, -1)}>
            <ChevronUp size={14} />
          </button>
          <button
            disabled={listIdx === totalLength - 1}
            onClick={() => handleMove(side, listIdx, 1)}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
      <div className={styles['node-editor-handle-label']}>
        <span className={styles['node-editor-handle-name']}>{name}</span>
        {entry.variable && (
          <span className={styles['node-editor-sink-note']}>
            (Sets max sink capacity, not current flow)
          </span>
        )}
      </div>
      <div className={styles['node-editor-quantity-section']}>
        <input
          type="text"
          inputMode="decimal"
          value={currentQuantityStr}
          onChange={(e) => handleQtyChange(side, index, e.target.value, normalizedBaseQuantity)}
          onBlur={() => handleQtyBlur(side, index, normalizedBaseQuantity)}
          className={styles['node-editor-quantity-input']}
        />
        <span className={styles['node-editor-quantity-unit']}>{getRateSuffix(rateMode)}</span>
      </div>
    </div>
  );
}
