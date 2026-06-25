import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, X } from 'lucide-react';
import type { RecipeNodeData } from '../../../types/nodes';
import type { Recipe } from '../../../types/data';
import { useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { getConnectedNodes } from '../../../utils/graphTraversal';
import { getRateMultiplier, cleanMachineCount } from '../../../utils/recipeComputation';
import {
  clampHandleOrder,
  collectStaleHandleIndices,
  buildStaleHandleIds,
} from '../../../utils/nodeEditorHandles';
import { HandleEditorColumns } from './HandleEditorColumns';
import styles from './NodeEditor.module.css';
import { NodeEditorProvider } from './NodeEditorProvider';
import { useNodeEditorStore, NodeEditorContext } from './NodeEditorContext';
import { SettingsEditor } from './SettingsEditor';
import { getSpecialRecipe } from '../../../data/registry';
import { isRecipeNode } from '../../../types/nodes';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';

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
    <NodeEditorProvider
      recipe={recipe}
      initialData={initialData}
      multiplier={multiplier}
      nodeId={nodeId}
    >
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
  const updateNodeDataAndDeleteEdges = useFlowStore((s) => s.updateNodeDataAndDeleteEdges);
  const setNodesAndEdges = useFlowStore((s) => s.setNodesAndEdges);
  const runTransaction = useFlowStore((s) => s.runTransaction);

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

  const prepareHandleSave = () => {
    const { inputs, outputs, settings } = store!.getState();
    const currentRecipe = getCurrentRecipe();
    const { edges } = useFlowStore.getState();

    const clampedInputs = clampHandleOrder(inputs, currentRecipe.inputs.length);
    const clampedOutputs = clampHandleOrder(outputs, currentRecipe.outputs.length);

    const staleInputIndices = collectStaleHandleIndices(
      inputs,
      clampedInputs,
      nodeId,
      'input',
      currentRecipe.inputs.length,
      edges,
    );
    const staleOutputIndices = collectStaleHandleIndices(
      outputs,
      clampedOutputs,
      nodeId,
      'output',
      currentRecipe.outputs.length,
      edges,
    );

    return {
      settings,
      clampedInputs,
      clampedOutputs,
      staleInputIndices,
      staleOutputIndices,
    };
  };

  const handleSaveLocal = () => {
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({ type: 'node-editor-apply', mode: 'local' })
    ) {
      return;
    }

    const {
      settings,
      clampedInputs,
      clampedOutputs,
      staleInputIndices,
      staleOutputIndices,
    } = prepareHandleSave();

    const staleHandleIds = [
      ...buildStaleHandleIds(nodeId, 'input', staleInputIndices),
      ...buildStaleHandleIds(nodeId, 'output', staleOutputIndices),
    ];

    runTransaction(() => {
      updateNodeDataAndDeleteEdges(
        nodeId,
        {
          machineCount: cleanMachineCount(machineCount),
          inputOrder: clampedInputs,
          outputOrder: clampedOutputs,
          settings: settings,
        },
        staleHandleIds,
      );
    });
    onClose();
    completeTutorialAction({ type: 'node-editor-apply', mode: 'local' });
  };

  const initialMachineCount = initialData.machineCount;
  const isPropagationDisabled =
    initialMachineCount === 0 || machineCount === 0 || isNaN(machineCount);

  const handleSavePropagated = () => {
    if (isPropagationDisabled) return;
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({ type: 'node-editor-apply', mode: 'chain' })
    ) {
      return;
    }

    const {
      settings,
      clampedInputs,
      clampedOutputs,
      staleInputIndices,
      staleOutputIndices,
    } = prepareHandleSave();

    const { nodes, edges } = useFlowStore.getState();

    const factor = machineCount / initialMachineCount;
    const connectedIds = getConnectedNodes(nodeId, edges);

    const staleHandleIds = [
      ...buildStaleHandleIds(nodeId, 'input', staleInputIndices),
      ...buildStaleHandleIds(nodeId, 'output', staleOutputIndices),
    ];
    const staleHandleIdSet = new Set(staleHandleIds);
    const nextEdges = edges.filter(
      (edge) =>
        !staleHandleIdSet.has(edge.sourceHandle ?? '') &&
        !staleHandleIdSet.has(edge.targetHandle ?? ''),
    );

    const updatedNodes = nodes.map((node) => {
      if (!isRecipeNode(node)) return node;

      if (connectedIds.has(node.id)) {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              machineCount: cleanMachineCount(machineCount),
              inputOrder: clampedInputs,
              outputOrder: clampedOutputs,
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

    runTransaction(() => {
      setNodesAndEdges(updatedNodes, nextEdges);
    });
    onClose();
    completeTutorialAction({ type: 'node-editor-apply', mode: 'chain' });
  };

  const handleClose = () => {
    if (isTutorialActive()) return;
    onClose();
  };

  const handleTabClick = (tab: 'count' | 'settings') => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'node-editor-tab', tab })) {
      return;
    }
    setActiveTab(tab);
    completeTutorialAction({ type: 'node-editor-tab', tab });
  };

  const handleMachineCountInput = (value: string) => {
    if (isTutorialActive()) {
      const action = useTutorialStore.getState().getCurrentStep()?.action;
      if (action?.type !== 'node-editor-machine-count') return;
    }
    handleMachineCountChange(value);
    completeTutorialAction({
      type: 'node-editor-machine-count',
      nodeId,
      value: Number(value),
    });
  };

  return createPortal(
    <div className={styles['node-editor-overlay']} onClick={handleClose}>
      <div className={styles['node-editor-modal']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['node-editor-header']}>
          <h2 id="node-editor-dialog-title">Node Editor</h2>
          <div className={styles['node-editor-header-actions']}>
            <button
              className={styles['node-editor-btn-icon']}
              onClick={() => {
                if (isTutorialActive()) return;
                handleResetHandles();
              }}
            >
              <RotateCcw size={18} />
            </button>
            <button className={styles['node-editor-btn-icon']} onClick={handleClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles['node-editor-content']}>
          <div className={styles['node-editor-tabs']}>
            <button
              className={`${styles['node-editor-tab']} ${activeTab === 'count' ? styles['is-active'] : ''}`}
              onClick={() => handleTabClick('count')}
              data-tutorial-node-editor="count-tab"
            >
              Count & Handles
            </button>
            {hasSettings && (
              <button
                className={`${styles['node-editor-tab']} ${activeTab === 'settings' ? styles['is-active'] : ''}`}
                onClick={() => handleTabClick('settings')}
                data-tutorial-node-editor="settings-tab"
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
                  onChange={(e) => handleMachineCountInput(e.target.value)}
                  onBlur={handleMachineCountBlur}
                  className={styles['node-editor-input']}
                  data-tutorial-node-editor="machine-count"
                />
              </div>

              <HandleEditorColumns
                recipe={currentRecipe}
                multiplier={multiplier}
                rateMode={rateMode}
                nodeId={nodeId}
              />
            </>
          ) : (
            <SettingsEditor recipe={recipe} nodeId={nodeId} />
          )}
        </div>

        <div className={styles['node-editor-footer']}>
          <button className={styles['node-editor-btn-secondary']} onClick={handleClose}>
            Cancel
          </button>
          <button
            className={styles['node-editor-btn-primary']}
            onClick={handleSaveLocal}
            data-tutorial-node-editor="apply-local"
          >
            Apply
          </button>
          <button
            className={styles['node-editor-btn-propagate']}
            disabled={isPropagationDisabled}
            onClick={handleSavePropagated}
            data-tutorial-node-editor="apply-chain"
          >
            Apply to Chain
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
