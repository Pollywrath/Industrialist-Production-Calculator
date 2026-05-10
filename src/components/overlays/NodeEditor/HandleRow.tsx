import type { Recipe } from '../../../types/data';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { getProductName } from '../../../data/lookup';
import {
  cleanFlow,
  cleanMachineCount,
  toPlainString,
  computeQuantityMap,
} from '../../../utils/recipeComputation';
import styles from './NodeEditor.module.css';

interface HandleRowProps {
  recipe: Recipe;
  side: 'input' | 'output';
  index: number;
  listIdx: number;
  totalLength: number;
  multiplier: number;
  rateMode: 'second' | 'minute' | 'hour' | 'raw';
  qtyStrMap: Record<string, string>;
  setQtyStrMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setMachineCount: (v: number) => void;
  setMachineCountStr: (v: string) => void;
  inputs: number[];
  setInputs: (v: number[]) => void;
  outputs: number[];
  setOutputs: (v: number[]) => void;
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
  qtyStrMap,
  setQtyStrMap,
  setMachineCount,
  setMachineCountStr,
  inputs,
  setInputs,
  outputs,
  setOutputs,
}: HandleRowProps) {
  const list = side === 'input' ? recipe.inputs : recipe.outputs;
  const entry = list[index];

  if (!entry) {
    return (
      <div className={`${styles['node-editor-item']} ${styles[`node-editor-item--${side}`]}`}>
        <div className={styles['node-editor-handle-label']} style={{ color: 'var(--theme-color-text-error)', fontStyle: 'italic' }}>
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
  const key = `${side}-${index}`;
  const currentQuantityStr = qtyStrMap[key] !== undefined ? qtyStrMap[key] : '';

  const handleMove = (direction: -1 | 1) => {
    const activeList = side === 'input' ? inputs : outputs;
    const setActiveList = side === 'input' ? setInputs : setOutputs;
    if (listIdx + direction < 0 || listIdx + direction >= activeList.length) return;
    const newList = [...activeList];
    const temp = newList[listIdx];
    newList[listIdx] = newList[listIdx + direction];
    newList[listIdx + direction] = temp;
    setActiveList(newList);
  };

  const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (!/^\d*(\.\d{0,8})?$/.test(rawVal)) return;

    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed >= 0) {
      const cleaned = cleanFlow(parsed);

      if (normalizedBaseQuantity > 0) {
        const newMachineCount = cleanMachineCount(cleaned / normalizedBaseQuantity);
        setMachineCount(newMachineCount);
        setMachineCountStr(toPlainString(newMachineCount, 12));

        setQtyStrMap(
          computeQuantityMap(recipe, inputs, outputs, newMachineCount, multiplier, key, rawVal)
        );
      } else {
        setQtyStrMap((prev) => ({ ...prev, [key]: rawVal }));
      }
    } else {
      setMachineCount(0);
      setMachineCountStr('');
      setQtyStrMap(
        computeQuantityMap(recipe, inputs, outputs, 0, multiplier, key, rawVal)
      );
    }
  };

  const handleQtyBlur = () => {
    const currentVal = qtyStrMap[key] || '';
    const parsed = parseFloat(currentVal);

    if (!isNaN(parsed) && parsed >= 0) {
      const cleaned = cleanFlow(parsed);
      const newMachineCount = cleanMachineCount(cleaned / normalizedBaseQuantity);
      setQtyStrMap(
        computeQuantityMap(
          recipe,
          inputs,
          outputs,
          newMachineCount,
          multiplier,
          key,
          toPlainString(cleaned, 8)
        )
      );
    } else {
      setMachineCount(0);
      setMachineCountStr('0');
      setQtyStrMap(computeQuantityMap(recipe, inputs, outputs, 0, multiplier));
    }
  };

  return (
    <div className={`${styles['node-editor-item']} ${styles[`node-editor-item--${side}`]}`}>
      <div className={styles['node-editor-actions']}>
        <div className={styles['node-editor-actions-stack']}>
          <button disabled={listIdx === 0} onClick={() => handleMove(-1)} title="Move up">
            <ChevronUp size={12} />
          </button>
          <button disabled={listIdx === totalLength - 1} onClick={() => handleMove(1)} title="Move down">
            <ChevronDown size={12} />
          </button>
        </div>
      </div>
      <div className={styles['node-editor-handle-label']} title={name}>
        {name}
      </div>
      <div className={styles['node-editor-quantity-section']}>
        <input
          type="text"
          inputMode="decimal"
          value={currentQuantityStr}
          onChange={handleQtyChange}
          onBlur={handleQtyBlur}
          className={styles['node-editor-quantity-input']}
        />
        <span className={styles['node-editor-quantity-unit']}>{getRateSuffix(rateMode)}</span>
      </div>
    </div>
  );
}
