import {
  Plus,
  Group,
  Trash2,
  MousePointerSquareDashed,
  Target,
  Network,
  Cpu,
  Sparkles,
  Settings,
  Clock,
  Eraser,
  Undo,
  Redo,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { useUIStore, getEffectiveToggleId } from '../../stores/useUIStore';
import { useFlowStore } from '../../stores/useFlowStore';
import { useEdgeThemeStore } from '../../stores/useEdgeThemeStore';
import { isRatioOptimizerRunning } from '../../solver/ratioOptimizer';
import { isRecipeNode } from '../../types/nodes';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
} from '../../stores/useTutorialStore';
import styles from './ControlsTray.module.css';

interface ButtonConfig {
  id: string;
  label: string;
  type: 'menu' | 'toggle' | 'switch' | 'action';
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  dividerRight?: boolean;
  dividerBottom?: boolean;
}

const BUTTONS: ButtonConfig[] = [
  {
    id: 'add_recipe',
    label: 'Add Recipe',
    type: 'menu',
    Icon: Plus,
    dividerBottom: true,
  },
  {
    id: 'delete_mode',
    label: 'Delete',
    type: 'toggle',
    Icon: Trash2,
    dividerBottom: true,
  },
  {
    id: 'multi_select',
    label: 'Multi-select',
    type: 'toggle',
    Icon: MousePointerSquareDashed,
    dividerBottom: true,
  },
  {
    id: 'target',
    label: 'Target',
    type: 'toggle',
    Icon: Target,
    dividerRight: true,
    dividerBottom: true,
  },
  {
    id: 'layout',
    label: 'Layout',
    type: 'menu',
    Icon: Network,
    dividerBottom: true,
  },
  {
    id: 'compute',
    label: 'Compute',
    type: 'action',
    Icon: Cpu,
    dividerBottom: true,
  },
  {
    id: 'coming_soon',
    label: 'Coming Soon',
    type: 'action',
    Icon: Sparkles,
  },
  {
    id: 'machine_toggle',
    label: 'Machines',
    type: 'menu',
    Icon: Settings,
    dividerRight: true,
  },
  {
    id: 'rate_mode',
    label: 'Rate',
    type: 'switch',
    Icon: Clock,
    dividerRight: true,
  },
  { id: 'clear_canvas', label: 'Clear', type: 'action', Icon: Eraser },
  { id: 'undo', label: 'Undo', type: 'action', Icon: Undo },
  { id: 'redo', label: 'Redo', type: 'action', Icon: Redo },
];

const UNWIRED_IDS = new Set([
  'coming_soon',
]);

export function ControlsTray() {
  const [isLayouting, setIsLayouting] = useState(false);
  const isMinimized = useUIStore((s) => s.isControlsMinimized);
  const activeToggleId = useUIStore(getEffectiveToggleId);
  const rateMode = useUIStore((s) => s.rateMode);
  const isMachineOverlayOpen = useUIStore((s) => s.isMachineOverlayOpen);
  const edgePathStyle = useEdgeThemeStore((s) => s.pathStyle);

  const setRecipeSelectorOpen = useUIStore((s) => s.setRecipeSelectorOpen);
  const setMachineOverlayOpen = useUIStore((s) => s.setMachineOverlayOpen);
  const toggleButton = useUIStore((s) => s.toggleButton);
  const cycleRateMode = useUIStore((s) => s.cycleRateMode);
  const toggleMinimized = useUIStore((s) => s.toggleControlsMinimized);
  const nodeCount = useFlowStore((s) => s.nodes.length);
  const canUndo = useFlowStore((s) => s.canUndo);
  const canRedo = useFlowStore((s) => s.canRedo);
  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const setNodesAndEdges = useFlowStore((s) => s.setNodesAndEdges);
  const applyAutoLayoutResult = useFlowStore((s) => s.applyAutoLayoutResult);
  const createGroupFromSelection = useFlowStore((s) => s.createGroupFromSelection);
  const selectedGroupableNodeCount = useFlowStore((s) => {
    let count = 0;
    for (let i = 0; i < s.nodes.length; i++) {
      const node = s.nodes[i];
      if (isRecipeNode(node) && node.data.isMultiSelected && !node.data.groupId) {
        count += 1;
      }
    }
    return count;
  });
  const hasGroupableSelection = selectedGroupableNodeCount > 0;
  const isMultiSelectMode = activeToggleId === 'multi_select';
  const isAddGroupMode = isMultiSelectMode;

  const handleButtonClick = (btn: ButtonConfig) => {
    if (isTutorialActive()) {
      const tutorialEvent =
        btn.id === 'add_recipe' && isAddGroupMode
          ? ({ type: 'group-create' } as const)
          : ({ type: 'control', id: btn.id } as const);
      if (!canPerformTutorialAction(tutorialEvent)) {
        return;
      }
    }

    if (btn.id === 'add_recipe') {
      if (isAddGroupMode) {
        if (!hasGroupableSelection) return;
        const groupId = createGroupFromSelection();
        const uiState = useUIStore.getState();
        useUIStore.setState({
          activeToggleId: uiState.activeToggleId === 'multi_select' ? null : uiState.activeToggleId,
          temporaryOverrides: uiState.temporaryOverrides.filter((id) => id !== 'multi_select'),
        });
        if (groupId) {
          completeTutorialAction({ type: 'group-create', groupId });
        }
        return;
      }
      setRecipeSelectorOpen(true);
      completeTutorialAction({ type: 'control', id: 'add_recipe' });
    } else if (btn.id === 'delete_mode') {
      toggleButton('delete_mode');
      completeTutorialAction({ type: 'control', id: btn.id });
    } else if (btn.id === 'multi_select') {
      toggleButton('multi_select');
      completeTutorialAction({ type: 'control', id: btn.id });
    } else if (btn.id === 'target') {
      toggleButton('target');
      completeTutorialAction({ type: 'control', id: btn.id });
    } else if (btn.id === 'machine_toggle') {
      setMachineOverlayOpen(!isMachineOverlayOpen);
    } else if (btn.id === 'compute') {
      if (isRatioOptimizerRunning()) {
        void useUIStore.getState().confirm({
          title: 'Solver Busy',
          message: 'An optimization run is already in progress. Please wait for it to finish or cancel it first.',
          confirmLabel: 'OK',
          cancelLabel: 'CLOSE',
          intent: 'info',
        });
        return;
      }
      const flowStore = useFlowStore.getState();
      const hasTargetNode = flowStore.nodes.some((n) => isRecipeNode(n) && !!n.data.isTarget);
      if (!hasTargetNode) {
        void useUIStore.getState().confirm({
          title: 'No Target Nodes Selected',
          message: 'Please set at least one node as a target to anchor the ratio optimization. You can toggle the Target tool (Shift key or Target button) and click on a node.',
          confirmLabel: 'OK',
          cancelLabel: 'CLOSE',
          intent: 'info',
        });
        return;
      }
      useUIStore.getState().setIsLPSolverOpen(true);
      completeTutorialAction({ type: 'control', id: 'compute' });
    } else if (btn.id === 'coming_soon') {
      void useUIStore.getState().confirm({
        title: 'Coming Soon',
        message: 'This feature is under development. Stay tuned!',
        confirmLabel: 'OK',
        cancelLabel: 'CLOSE',
        intent: 'info',
      });
    } else if (btn.id === 'rate_mode') {
      cycleRateMode();
    } else if (btn.id === 'layout') {
      if (isLayouting) return;
      const flowStore = useFlowStore.getState();
      if (flowStore.nodes.length === 0) return;
      const layoutGraphVersion = flowStore.graphVersion;

      setIsLayouting(true);
      void import('../../utils/autoLayout')
        .then(({ autoLayout }) => {
          return autoLayout(flowStore.nodes, flowStore.edges, { edgePath: edgePathStyle });
        })
        .then(({ nodes, edges }) => {
          const didApply = applyAutoLayoutResult(nodes, edges, layoutGraphVersion);
          if (didApply) {
            useUIStore.getState().requestFitView();
            completeTutorialAction({ type: 'control', id: 'layout' });
          }
        })
        .catch((error) => {
          console.error('Auto-layout failed:', error);
        })
        .finally(() => {
          setIsLayouting(false);
        });
    } else if (btn.id === 'clear_canvas') {
      setNodesAndEdges([], []);
    } else if (btn.id === 'undo') {
      undo();
    } else if (btn.id === 'redo') {
      redo();
    }
  };

  const getRateButtonLabel = () => {
    switch (rateMode) {
      case 'second':
        return '/sec';
      case 'minute':
        return '/min';
      case 'hour':
        return '/hr';
      case 'raw':
        return 'Raw';
    }
  };

  return (
    <div className={styles['controls-tray-container']}>
      <button
        className={styles['controls-tray-bar']}
        onClick={() => {
          if (isTutorialActive()) return;
          toggleMinimized();
        }}
      >
        <span className={styles['controls-tray-bar-text']}>
          {isMinimized ? (
            <>
              <ChevronUp size={10} />
              <span>SHOW CONTROLS</span>
            </>
          ) : (
            <>
              <ChevronDown size={10} />
              <span>HIDE CONTROLS</span>
            </>
          )}
        </span>
      </button>

      {!isMinimized && (
        <div className={styles['controls-tray-grid']}>
          {BUTTONS.map((btn) => {
            const isHistoryDisabled =
              (btn.id === 'undo' && !canUndo) || (btn.id === 'redo' && !canRedo);
            const isLayoutDisabled = btn.id === 'layout' && (isLayouting || nodeCount === 0);
            const isAddGroupDisabled =
              btn.id === 'add_recipe' && isAddGroupMode && !hasGroupableSelection;
            const isDisabled =
              UNWIRED_IDS.has(btn.id) ||
              isHistoryDisabled ||
              isLayoutDisabled ||
              isAddGroupDisabled;
            const isToggled =
              !isDisabled &&
              (btn.id === activeToggleId ||
                (btn.id === 'add_recipe' && isAddGroupMode && hasGroupableSelection) ||
                (btn.id === 'machine_toggle' && isMachineOverlayOpen));
            const label =
              btn.id === 'rate_mode'
                ? getRateButtonLabel()
                : btn.id === 'layout' && isLayouting
                  ? 'Layout...'
                  : btn.id === 'add_recipe' && isAddGroupMode
                    ? 'Add Group'
                  : btn.label;
            const Icon = btn.id === 'add_recipe' && isAddGroupMode ? Group : btn.Icon;

            return (
              <button
                key={btn.id}
                className={`${styles['controls-tray-button']} type-${btn.type} ${isToggled ? styles['is-active'] : ''} ${btn.dividerRight ? styles['has-divider-right'] : ''} ${btn.dividerBottom ? styles['has-divider-bottom'] : ''}`}
                onClick={() => handleButtonClick(btn)}
                disabled={isDisabled}
                data-tutorial-control-id={btn.id}
              >
                <Icon size={16} className={styles['controls-tray-button-icon']} />
                <span className={styles['controls-tray-button-label']}>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
