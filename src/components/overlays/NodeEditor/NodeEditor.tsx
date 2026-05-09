import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X } from 'lucide-react';
import type { RecipeNodeData, HandleRef } from '../../../types/nodes';
import type { Recipe } from '../../../types/data';
import { getProductName } from '../../../data/lookup';
import useControlStore from '../../../stores/useControlStore';
import useFlowStore from '../../../stores/useFlowStore';
import { getConnectedNodes } from '../../../utils/graphTraversal';
import {
  getRateMultiplier,
  cleanMachineCount,
  cleanFlow,
  toPlainString,
} from '../../../utils/recipeComputation';
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

  const [customName, setCustomName] = useState(initialData.customName || '');
  const [machineCount, setMachineCount] = useState(initialData.machineCount);
  const [inputs, setInputs] = useState<number[]>(() => {
    if (initialData.inputOrder) return initialData.inputOrder;
    return recipe.inputs.map((_, i) => i);
  });
  const [outputs, setOutputs] = useState<number[]>(() => {
    if (initialData.outputOrder) return initialData.outputOrder;
    return recipe.outputs.map((_, i) => i);
  });

  const getHandleBaseQuantity = (ref: HandleRef) => {
    const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[ref.index];
    if (!entry) return 0;
    return entry.quantity * multiplier;
  };

  const [machineCountStr, setMachineCountStr] = useState(
    toPlainString(initialData.machineCount, 12),
  );
  const [qtyStrMap, setQtyStrMap] = useState<Record<string, string>>(() => {
    const initialQtyMap: Record<string, string> = {};
    inputs.forEach((idx) => {
      const entry = recipe.inputs[idx];
      if (entry) {
        const baseQuantity = entry.quantity * multiplier;
        initialQtyMap[`input-${idx}`] = toPlainString(
          cleanFlow(baseQuantity * initialData.machineCount),
          10,
        );
      }
    });
    outputs.forEach((idx) => {
      const entry = recipe.outputs[idx];
      if (entry) {
        const baseQuantity = entry.quantity * multiplier;
        initialQtyMap[`output-${idx}`] = toPlainString(
          cleanFlow(baseQuantity * initialData.machineCount),
          10,
        );
      }
    });
    return initialQtyMap;
  });

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
      customName: customName.trim() || undefined,
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
              customName: customName.trim() || undefined,
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

  const moveItem = <T,>(list: T[], setList: (v: T[]) => void, index: number, direction: -1 | 1) => {
    if (index + direction < 0 || index + direction >= list.length) return;
    const newList = [...list];
    const temp = newList[index];
    newList[index] = newList[index + direction];
    newList[index + direction] = temp;
    setList(newList);
  };

  const getRateSuffix = () => {
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

  const renderHandleInfo = (ref: HandleRef) => {
    const list = ref.side === 'input' ? recipe.inputs : recipe.outputs;
    const entry = list[ref.index];
    if (!entry) {
      return (
        <>
          <div
            className={styles['node-editor-handle-label']}
            style={{ color: '#ff6c6c', fontStyle: 'italic' }}
          >
            Stale / Invalid Handle
          </div>
          <div className={styles['node-editor-quantity-section']}>
            <span style={{ color: '#888', fontSize: '13px' }}>N/A</span>
          </div>
        </>
      );
    }

    const name = getProductName(entry.product_id);
    const baseQuantity = entry.quantity;
    const normalizedBaseQuantity = baseQuantity * multiplier;
    const key = `${ref.side}-${ref.index}`;
    const currentQuantityStr = qtyStrMap[key] !== undefined ? qtyStrMap[key] : '';

    const handleQtyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawVal = e.target.value;
      if (!/^\d*(\.\d{0,10})?$/.test(rawVal)) return;

      setQtyStrMap((prev) => ({ ...prev, [key]: rawVal }));

      const parsed = parseFloat(rawVal);
      if (!isNaN(parsed) && parsed >= 0) {
        if (normalizedBaseQuantity > 0) {
          const newMachineCount = cleanMachineCount(parsed / normalizedBaseQuantity);
          setMachineCount(newMachineCount);
          setMachineCountStr(toPlainString(newMachineCount, 12));

          setQtyStrMap((prev) => {
            const updated = { ...prev };
            inputs.forEach((inpIdx) => {
              const hKey = `input-${inpIdx}`;
              if (hKey !== key) {
                const baseQty = getHandleBaseQuantity({
                  side: 'input',
                  index: inpIdx,
                });
                updated[hKey] = toPlainString(cleanFlow(baseQty * newMachineCount), 10);
              }
            });
            outputs.forEach((outIdx) => {
              const hKey = `output-${outIdx}`;
              if (hKey !== key) {
                const baseQty = getHandleBaseQuantity({
                  side: 'output',
                  index: outIdx,
                });
                updated[hKey] = toPlainString(cleanFlow(baseQty * newMachineCount), 10);
              }
            });
            return updated;
          });
        }
      } else if (rawVal === '') {
        setMachineCount(0);
        setMachineCountStr('');
        setQtyStrMap((prev) => {
          const updated = { ...prev };
          inputs.forEach((inpIdx) => {
            updated[`input-${inpIdx}`] = '';
          });
          outputs.forEach((outIdx) => {
            updated[`output-${outIdx}`] = '';
          });
          return updated;
        });
      }
    };

    const handleQtyBlur = () => {
      const currentVal = qtyStrMap[key] || '';
      const parsed = parseFloat(currentVal);
      if (!isNaN(parsed) && parsed >= 0) {
        const cleaned = cleanFlow(parsed);
        setQtyStrMap((prev) => ({
          ...prev,
          [key]: toPlainString(cleaned, 10),
        }));
      } else {
        setQtyStrMap((prev) => ({ ...prev, [key]: '' }));
      }
    };

    return (
      <>
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
          <span className={styles['node-editor-quantity-unit']}>{getRateSuffix()}</span>
        </div>
      </>
    );
  };

  const handleResetHandles = () => {
    const defaultInputs = recipe.inputs.map((_, i) => i);
    const defaultOutputs = recipe.outputs.map((_, i) => i);
    setInputs(defaultInputs);
    setOutputs(defaultOutputs);

    const newQtyStrMap: Record<string, string> = {};
    defaultInputs.forEach((idx) => {
      const baseQty = getHandleBaseQuantity({ side: 'input', index: idx });
      newQtyStrMap[`input-${idx}`] = toPlainString(cleanFlow(baseQty * machineCount), 10);
    });
    defaultOutputs.forEach((idx) => {
      const baseQty = getHandleBaseQuantity({ side: 'output', index: idx });
      newQtyStrMap[`output-${idx}`] = toPlainString(cleanFlow(baseQty * machineCount), 10);
    });
    setQtyStrMap(newQtyStrMap);
  };

  const handleMachineCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (!/^\d*(\.\d{0,12})?$/.test(rawVal)) return;

    setMachineCountStr(rawVal);

    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed >= 0) {
      const newMachineCount = cleanMachineCount(parsed);
      setMachineCount(newMachineCount);

      const newQtyStrMap: Record<string, string> = {};
      inputs.forEach((idx) => {
        const baseQty = getHandleBaseQuantity({ side: 'input', index: idx });
        newQtyStrMap[`input-${idx}`] = toPlainString(cleanFlow(baseQty * newMachineCount), 10);
      });
      outputs.forEach((idx) => {
        const baseQty = getHandleBaseQuantity({ side: 'output', index: idx });
        newQtyStrMap[`output-${idx}`] = toPlainString(cleanFlow(baseQty * newMachineCount), 10);
      });
      setQtyStrMap(newQtyStrMap);
    } else if (rawVal === '') {
      setMachineCount(0);
      const newQtyStrMap: Record<string, string> = {};
      inputs.forEach((idx) => {
        newQtyStrMap[`input-${idx}`] = '';
      });
      outputs.forEach((idx) => {
        newQtyStrMap[`output-${idx}`] = '';
      });
      setQtyStrMap(newQtyStrMap);
    }
  };

  const handleMachineCountBlur = () => {
    const parsed = parseFloat(machineCountStr);
    if (!isNaN(parsed) && parsed >= 0) {
      const cleaned = cleanMachineCount(parsed);
      setMachineCount(cleaned);
      setMachineCountStr(String(cleaned));
    } else {
      setMachineCount(0);
      setMachineCountStr('');
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
            <label>Name</label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder={recipe.name}
              className={styles['node-editor-input']}
            />
          </div>

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

          <div className={styles['node-editor-columns']}>
            <div className={styles['node-editor-column']}>
              <h3>Input Handles</h3>
              <div className={styles['node-editor-list']}>
                {inputs.map((idx, listIdx) => (
                  <div
                    key={`input-${idx}`}
                    className={`${styles['node-editor-item']} ${styles['node-editor-item--input']}`}
                  >
                    <div className={styles['node-editor-actions']}>
                      <div className={styles['node-editor-actions-stack']}>
                        <button
                          disabled={listIdx === 0}
                          onClick={() => moveItem(inputs, setInputs, listIdx, -1)}
                        >
                          ↑
                        </button>
                        <button
                          disabled={listIdx === inputs.length - 1}
                          onClick={() => moveItem(inputs, setInputs, listIdx, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                    {renderHandleInfo({ side: 'input', index: idx })}
                  </div>
                ))}
                {inputs.length === 0 && <div className={styles['node-editor-empty']}>None</div>}
              </div>
            </div>

            <div className={styles['node-editor-column']}>
              <h3>Output Handles</h3>
              <div className={styles['node-editor-list']}>
                {outputs.map((idx, listIdx) => (
                  <div
                    key={`output-${idx}`}
                    className={`${styles['node-editor-item']} ${styles['node-editor-item--output']}`}
                  >
                    <div className={styles['node-editor-actions']}>
                      <div className={styles['node-editor-actions-stack']}>
                        <button
                          disabled={listIdx === 0}
                          onClick={() => moveItem(outputs, setOutputs, listIdx, -1)}
                        >
                          ↑
                        </button>
                        <button
                          disabled={listIdx === outputs.length - 1}
                          onClick={() => moveItem(outputs, setOutputs, listIdx, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                    {renderHandleInfo({ side: 'output', index: idx })}
                  </div>
                ))}
                {outputs.length === 0 && <div className={styles['node-editor-empty']}>None</div>}
              </div>
            </div>
          </div>
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
