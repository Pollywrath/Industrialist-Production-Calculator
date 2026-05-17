import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X } from 'lucide-react';
import type { RecipeNodeData } from '../../../types/nodes';
import type { Recipe } from '../../../types/data';
import { useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { getConnectedNodes } from '../../../utils/graphTraversal';
import { getRateMultiplier, cleanMachineCount } from '../../../utils/recipeComputation';
import { HandleEditorColumns } from './HandleEditorColumns';
import styles from './NodeEditor.module.css';
import { NodeEditorProvider } from './NodeEditorProvider';
import { useNodeEditorStore, NodeEditorContext } from './NodeEditorContext';
import { SettingsEditor } from './SettingsEditor';
import { getSpecialRecipe } from '../../../data/registry';


interface NodeEditorProps {
  recipe: Recipe;
  initialData: RecipeNodeData;
  nodeId: string;
  onClose: () => void;
}

export function NodeEditor({ recipe, initialData, nodeId, onClose }: NodeEditorProps) {
  const rateMode = useUIStore((s) => s.rateMode);
  const multiplier = getRateMultiplier(recipe.cycle_time, rateMode);

  return (
    <NodeEditorProvider recipe={recipe} initialData={initialData} multiplier={multiplier}>
      <NodeEditorModal
        recipe={recipe}
        multiplier={multiplier}
        rateMode={rateMode}
        nodeId={nodeId}
        onClose={onClose}
        initialData={initialData}
      />
    </NodeEditorProvider>
  );
}

interface NodeEditorModalProps {
  recipe: Recipe;
  multiplier: number;
  rateMode: 'second' | 'minute' | 'hour' | 'raw';
  nodeId: string;
  onClose: () => void;
  initialData: RecipeNodeData;
}

import { useShallow } from 'zustand/react/shallow';

function NodeEditorModal({
  recipe,
  multiplier,
  rateMode,
  nodeId,
  onClose,
  initialData,
}: NodeEditorModalProps) {
  const store = useContext(NodeEditorContext);
  const updateNodeData = useFlowStore((s) => s.updateNodeData);
  const setNodes = useFlowStore((s) => s.setNodes);

  const {
    machineCount,
    machineCountStr,
    activeTab,
    handleMachineCountChange,

    handleMachineCountBlur,
    handleResetHandles,
    setActiveTab,
    getCurrentRecipe,
  } = useNodeEditorStore(
    useShallow((s) => ({
      machineCount: s.machineCount,
      machineCountStr: s.machineCountStr,
      activeTab: s.activeTab,
      settings: s.settings,
      handleMachineCountChange: s.handleMachineCountChange,
      handleMachineCountBlur: s.handleMachineCountBlur,
      handleResetHandles: s.handleResetHandles,
      setActiveTab: s.setActiveTab,
      getCurrentRecipe: s.getCurrentRecipe,
    })),
  );

  const currentRecipe = getCurrentRecipe();
  const hasSettings = !!getSpecialRecipe(recipe.id);






  const handleSaveLocal = () => {
    const { inputs, outputs, settings } = store!.getState();
    updateNodeData(nodeId, {
      machineCount: cleanMachineCount(machineCount),
      inputOrder: inputs,
      outputOrder: outputs,
      settings: settings,
    });
    onClose();
  };


  const initialMachineCount = initialData.machineCount;
  const isPropagationDisabled =
    initialMachineCount === 0 || machineCount === 0 || isNaN(machineCount);

  const handleSavePropagated = () => {
    if (isPropagationDisabled) return;

    const { inputs, outputs, settings } = store!.getState();
    const factor = machineCount / initialMachineCount;
    const { nodes, edges } = useFlowStore.getState();
    const connectedIds = getConnectedNodes(nodeId, edges);

    const updatedNodes = nodes.map((node) => {
      if (connectedIds.has(node.id)) {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              machineCount: cleanMachineCount(machineCount),
              inputOrder: inputs,
              outputOrder: outputs,
              settings: settings,
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

    setNodes(updatedNodes);
    onClose();
  };


  return createPortal(
    <div
      className={styles['node-editor-overlay']}
      onClick={onClose}
    >
      <div
        className={styles['node-editor-modal']}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles['node-editor-header']}>
          <h2 id="node-editor-dialog-title">Node Editor</h2>
          <div className={styles['node-editor-header-actions']}>
            <button
              className={styles['node-editor-btn-icon']}
              onClick={handleResetHandles}
            >
              <RotateCcw size={18} />
            </button>
            <button
              className={styles['node-editor-btn-icon']}
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles['node-editor-content']}>
          <div className={styles['node-editor-tabs']}>
            <button
              className={`${styles['node-editor-tab']} ${activeTab === 'count' ? styles['is-active'] : ''}`}
              onClick={() => setActiveTab('count')}
            >
              Count & Handles
            </button>
            {hasSettings && (
              <button
                className={`${styles['node-editor-tab']} ${activeTab === 'settings' ? styles['is-active'] : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                Settings
              </button>
            )}
          </div>

          {activeTab === 'count' ? (
            <>
              <div className={styles['node-editor-group']}>
                <label>Machine Count</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={machineCountStr}
                  onChange={(e) => handleMachineCountChange(e.target.value)}
                  onBlur={handleMachineCountBlur}
                  className={styles['node-editor-input']}
                />
              </div>

              <HandleEditorColumns recipe={currentRecipe} multiplier={multiplier} rateMode={rateMode} />
            </>
          ) : (
            <SettingsEditor recipe={recipe} />
          )}
        </div>


        <div className={styles['node-editor-footer']}>
          <button className={styles['node-editor-btn-secondary']} onClick={onClose}>
            Cancel
          </button>
          <button className={styles['node-editor-btn-primary']} onClick={handleSaveLocal}>
            Apply
          </button>
          <button
            className={styles['node-editor-btn-propagate']}
            disabled={isPropagationDisabled}
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
