import type { Recipe } from '../../../types/data';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { getProductName } from '../../../data/lookup';
import styles from './NodeEditor.module.css';
import { useNodeEditorStore } from './NodeEditorContext';

interface HandleRowProps {
  recipe: Recipe;
  side: 'input' | 'output';
  index: number;
  listIdx: number;
  totalLength: number;
  multiplier: number;
  rateMode: 'second' | 'minute' | 'hour' | 'raw';
}

const getRateSuffix = (rateMode: 'second' | 'minute' | 'hour' | 'raw') => {
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
        <div
          className={styles['node-editor-handle-label']}
          style={{ color: 'var(--theme-color-text-error)', fontStyle: 'italic' }}
        >
          Stale / Invalid Handle
        </div>
        <div className={styles['node-editor-quantity-section']}>
          <span style={{ color: 'var(--theme-color-text-neutral)', fontSize: '13px' }}>N/A</span>
        </div>
      </div>
    );
  }

  const name = getProductName(entry.product_id);
  const baseQuantity = entry.quantity;
  const normalizedBaseQuantity = baseQuantity * multiplier;

  return (
    <div className={`${styles['node-editor-item']} ${styles[`node-editor-item--${side}`]}`}>
      <div className={styles['node-editor-actions']}>
        <div className={styles['node-editor-actions-stack']}>
          <button disabled={listIdx === 0} onClick={() => handleMove(side, listIdx, -1)}>
            <ChevronUp size={12} />
          </button>
          <button
            disabled={listIdx === totalLength - 1}
            onClick={() => handleMove(side, listIdx, 1)}
          >
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
      <div className={styles['node-editor-handle-label']}>{name}</div>
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
