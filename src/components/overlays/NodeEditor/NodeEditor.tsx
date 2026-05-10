import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X } from 'lucide-react';
import type { RecipeNodeData } from '../../../types/nodes';
import type { Recipe } from '../../../types/data';
import useControlStore from '../../../stores/useControlStore';
import useFlowStore from '../../../stores/useFlowStore';
import { getConnectedNodes } from '../../../utils/graphTraversal';
import {
  getRateMultiplier,
  cleanMachineCount,
  toPlainString,
  computeQuantityMap,
} from '../../../utils/recipeComputation';
import { HandleEditorColumns } from './HandleEditorColumns';
import styles from './NodeEditor.module.css';

interface NodeEditorProps {
  recipe: Recipe;
  initialData: RecipeNodeData;
  nodeId: string;
  onClose: () => void;
}

export default function NodeEditor({ recipe, initialData, nodeId, onClose }: NodeEditorProps) {
  const rateMode = useControlStore((s) => s.rateMode);
  const multiplier = getRateMultiplier(recipe.cycle_time, rateMode);

  const [machineCount, setMachineCount] = useState(initialData.machineCount);
  const [inputs, setInputs] = useState<number[]>(() => {
    if (initialData.inputOrder) return initialData.inputOrder;
    return recipe.inputs.map((_, i) => i);
  });
  const [outputs, setOutputs] = useState<number[]>(() => {
    if (initialData.outputOrder) return initialData.outputOrder;
    return recipe.outputs.map((_, i) => i);
  });

  const [machineCountStr, setMachineCountStr] = useState(
    toPlainString(initialData.machineCount, 12),
  );
  const [qtyStrMap, setQtyStrMap] = useState<Record<string, string>>(() =>
    computeQuantityMap(recipe, inputs, outputs, initialData.machineCount, multiplier)
  );

  useEffect(() => {
    const count = parseInt(document.body.dataset.scrollLockCount || '0', 10);

    if (count === 0) {
      document.body.dataset.originalOverflow = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
    }

    document.body.dataset.scrollLockCount = String(count + 1);

    return () => {
      const currentCount = parseInt(document.body.dataset.scrollLockCount || '1', 10) - 1;
      document.body.dataset.scrollLockCount = String(currentCount);

      if (currentCount <= 0) {
        document.body.style.overflow = document.body.dataset.originalOverflow || '';
        delete document.body.dataset.originalOverflow;
        delete document.body.dataset.scrollLockCount;
      }
    };
  }, []);

  const handleClose = () => {
    onClose();
  };

  const handleSaveLocal = () => {
    const flowStore = useFlowStore.getState();
    flowStore.updateNodeData(nodeId, {
      machineCount: cleanMachineCount(machineCount),
      inputOrder: inputs,
      outputOrder: outputs,
    });
    handleClose();
  };

  const initialMachineCount = initialData.machineCount;
  const isPropagationDisabled =
    initialMachineCount === 0 || machineCount === 0 || isNaN(machineCount);
  const disabledReason =
    initialMachineCount === 0
      ? 'Cannot propagate ratio changes when initial machine count is 0.'
      : machineCount === 0
        ? 'Cannot propagate ratio changes to 0 machines.'
        : undefined;

  const handleSavePropagated = () => {
    if (isPropagationDisabled) return;

    const factor = machineCount / initialMachineCount;
    const flowStore = useFlowStore.getState();
    const connectedIds = getConnectedNodes(nodeId, flowStore.edges);

    const updatedNodes = flowStore.nodes.map((node) => {
      if (connectedIds.has(node.id)) {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              machineCount: cleanMachineCount(machineCount),
              inputOrder: inputs,
              outputOrder: outputs,
            },
          };
        } else {
          const currentCount = node.data.machineCount;
          const scaledCount = cleanMachineCount(currentCount * factor);
          return {
            ...node,
            data: {
              ...node.data,
              machineCount: scaledCount,
            },
          };
        }
      }
      return node;
    });

    flowStore.setNodes(updatedNodes);
    handleClose();
  };

  const handleResetHandles = () => {
    const defaultInputs = recipe.inputs.map((_, i) => i);
    const defaultOutputs = recipe.outputs.map((_, i) => i);
    setInputs(defaultInputs);
    setOutputs(defaultOutputs);

    setQtyStrMap(computeQuantityMap(recipe, defaultInputs, defaultOutputs, machineCount, multiplier));
  };

  const handleMachineCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (!/^\d*(\.\d{0,12})?$/.test(rawVal)) return;

    setMachineCountStr(rawVal);

    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed >= 0) {
      const cleaned = cleanMachineCount(parsed);
      setMachineCount(cleaned);
      setQtyStrMap(computeQuantityMap(recipe, inputs, outputs, cleaned, multiplier));
    } else {
      setMachineCount(0);
      setQtyStrMap(computeQuantityMap(recipe, inputs, outputs, 0, multiplier));
    }
  };

  const handleMachineCountBlur = () => {
    const parsed = parseFloat(machineCountStr);
    if (!isNaN(parsed) && parsed >= 0) {
      const cleaned = cleanMachineCount(parsed);
      setMachineCount(cleaned);
      setMachineCountStr(toPlainString(cleaned, 12));
      setQtyStrMap(computeQuantityMap(recipe, inputs, outputs, cleaned, multiplier));
    } else {
      setMachineCount(0);
      setMachineCountStr('0');
      setQtyStrMap(computeQuantityMap(recipe, inputs, outputs, 0, multiplier));
    }
  };

  return createPortal(
    <div className={styles['node-editor-overlay']} onClick={handleClose}>
      <div className={styles['node-editor-modal']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['node-editor-header']}>
          <h2>Node Editor</h2>
          <div className={styles['node-editor-header-actions']}>
            <button
              className={styles['node-editor-btn-icon']}
              onClick={handleResetHandles}
              title="Reset handles to defaults"
            >
              <RotateCcw size={18} />
            </button>
            <button
              className={styles['node-editor-btn-icon']}
              onClick={handleClose}
              title="Close editor"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles['node-editor-content']}>
          <div className={styles['node-editor-group']}>
            <label>Machine Count</label>
            <input
              type="text"
              inputMode="decimal"
              value={machineCountStr}
              onChange={handleMachineCountChange}
              onBlur={handleMachineCountBlur}
              className={styles['node-editor-input']}
            />
          </div>

          <HandleEditorColumns
            recipe={recipe}
            multiplier={multiplier}
            rateMode={rateMode}
            inputs={inputs}
            setInputs={setInputs}
            outputs={outputs}
            setOutputs={setOutputs}
            qtyStrMap={qtyStrMap}
            setQtyStrMap={setQtyStrMap}
            setMachineCount={setMachineCount}
            setMachineCountStr={setMachineCountStr}
          />
        </div>

        <div className={styles['node-editor-footer']}>
          <button className={styles['node-editor-btn-secondary']} onClick={handleClose}>
            Cancel
          </button>
          <button className={styles['node-editor-btn-primary']} onClick={handleSaveLocal}>
            Apply
          </button>
          <button
            className={styles['node-editor-btn-propagate']}
            disabled={isPropagationDisabled}
            title={disabledReason}
            onClick={handleSavePropagated}
          >
            Apply to Chain
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
