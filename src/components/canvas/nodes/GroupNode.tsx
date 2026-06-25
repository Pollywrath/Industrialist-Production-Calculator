import { type CSSProperties, useEffect } from 'react';
import { useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Ellipsis } from 'lucide-react';
import { getEffectiveToggleId, useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useFlowResultStore } from '../../../stores/useFlowResultStore';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
import { useDataStore } from '../../../stores/useDataStore';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
} from '../../../stores/useTutorialStore';
import { isRecipeNode } from '../../../types/nodes';
import type { GroupNodeType, RecipeNodeType } from '../../../types/nodes';
import { getMachine, resolveActiveRecipe } from '../../../data/lookup';
import { getSpecialRecipe } from '../../../data/registry';
import {
  formatCurrency,
  formatPower,
  formatPollution,
} from '../../../utils/unitFormatting';
import { getRecipePowerTotals } from '../../../utils/recipePower';
import {
  EMPTY_GROUP_HEIGHT,
  EMPTY_GROUP_WIDTH,
  GROUP_HEADER_HEIGHT,
  getCollapsedGroupHeight,
} from '../../../utils/groupBounds';
import { GroupNodeEditor } from '../../overlays/GroupNodeEditor';
import { GroupNodeIO } from './GroupNodeIO';
import styles from './GroupNode.module.css';
import recipeStyles from './RecipeNode.module.css';
import { useShallow } from 'zustand/react/shallow';

const EMPTY_GROUP_MEMBER_IDS: string[] = [];

export function GroupNode({ id, data, height, width }: NodeProps<GroupNodeType>) {
  const isEditorOpen = useUIStore((s) => s.nodeEditorOpenId === id);
  const setIsEditorOpen = (open: boolean) => {
    useUIStore.setState({ nodeEditorOpenId: open ? id : null });
  };
  const updateGroupNodeData = useFlowStore((s) => s.updateGroupNodeData);
  const updateNodeInternals = useUpdateNodeInternals();
  const globalSettings = useGlobalSettingsStore((s) => s.settings);
  const dbVersion = useDataStore((s) => s.dbVersion);
  const flowResultGraphVersion = useFlowResultStore((s) => s.graphVersion);
  const flowResultDataDbVersion = useFlowResultStore((s) => s.dataDbVersion);
  const currentGraphVersion = useFlowStore((s) => s.graphVersion);
  const hasFreshSolveSnapshot =
    flowResultGraphVersion === currentGraphVersion &&
    flowResultDataDbVersion === dbVersion;

  const memberNodes = useFlowStore(
    useShallow((s) => {
      const memberIds = s.groupMemberIds[id] ?? EMPTY_GROUP_MEMBER_IDS;
      const values: RecipeNodeType[] = [];
      for (let i = 0; i < memberIds.length; i++) {
        const node = s.nodesMap.get(memberIds[i]);
        if (isRecipeNode(node)) {
          values.push(node);
        }
      }
      return values;
    })
  );
  const memberRecipes = useFlowResultStore(
    useShallow((s) => memberNodes.map((node) => s.nodeRecipes[node.id]))
  );

  useEffect(() => {
    updateNodeInternals(id);

    if (data.collapsed && !data.handlesReady) {
      const timer = setTimeout(() => {
        useFlowStore.getState().updateGroupNodeData(id, { handlesReady: true }, { recordHistory: false });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [
    id,
    data.collapsed,
    data.handlesReady,
    data.inputProxyHandleIds,
    data.outputProxyHandleIds,
    updateNodeInternals,
  ]);

  if (data.collapsed) {
    let totalMachineCost = 0;
    let totalPower = 0;
    let totalPollution = 0;

    memberNodes.forEach((node, index) => {
      if (!isRecipeNode(node)) return;
      const recipe =
        hasFreshSolveSnapshot
          ? memberRecipes[index] ?? resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id)
          : resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id) ?? memberRecipes[index];
      if (!recipe) return;
      const sr = getSpecialRecipe(recipe.id);
      const machine = getMachine(recipe.machine_id);
      const machineCount = node.data.machineCount ?? 0;
      const roundedCount = Math.ceil(machineCount);

      if (machine) {
        const baseCost =
          sr && sr.computeMachineCost
            ? sr.computeMachineCost(
                node.data.settings ?? {},
                globalSettings as unknown as Record<string, unknown>,
                node.id,
              )
            : machine.cost;
        totalMachineCost += baseCost * roundedCount;
      }

      totalPower += getRecipePowerTotals(recipe, machineCount).net;

      const pollutionMultiplier = sr?.pollutionIndependentOfMachineCount ? 1 : machineCount;
      totalPollution += recipe.pollution * pollutionMultiplier;
    });

    const displayHeight = height ?? getCollapsedGroupHeight(
      data.inputProxyHandleIds.length,
      data.outputProxyHandleIds.length,
    );

    return (
      <>
        <div
          className={recipeStyles['recipe-node']}
          style={{ '--node-height': `${displayHeight}px` } as React.CSSProperties}
          data-tutorial-node-id={id}
          data-db-version={dbVersion}
        >
          <div className={recipeStyles['recipe-node-info']}>
            <button
              className={`${recipeStyles['recipe-node-info__top-right-btn']} nodrag`}
              data-tutorial-group-node-id={id}
              data-tutorial-group-part="edit"
              onClick={(e) => {
                const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
                if (isDeleteMode) {
                  e.stopPropagation();
                  useFlowStore.getState().deleteNode(id);
                  return;
                }
                e.stopPropagation();
                if (isTutorialActive()) return;
                setIsEditorOpen(true);
              }}
            >
              <Ellipsis size={14} />
            </button>

            <div className={recipeStyles['recipe-node-info__title']}>{data.label}</div>

            <div className={recipeStyles['recipe-node-info__stats']}>
              <div className={recipeStyles['recipe-node-info__col--left']}>
                <div className={recipeStyles['recipe-node-info__stat']}>
                  <span className={recipeStyles['recipe-node-info__stat-label']}>Cost: </span>
                  <span className={recipeStyles['recipe-node-info__stat-value']}>
                    {formatCurrency(totalMachineCost)}
                  </span>
                </div>
                <div className={recipeStyles['recipe-node-info__stat']}>
                  <span className={recipeStyles['recipe-node-info__stat-label']}>Power: </span>
                  <span className={recipeStyles['recipe-node-info__stat-value']}>
                    {formatPower(totalPower)}
                  </span>
                </div>
                <div className={recipeStyles['recipe-node-info__stat']}>
                  <span className={recipeStyles['recipe-node-info__stat-label']}>Pollution: </span>
                  <span className={recipeStyles['recipe-node-info__stat-value']}>
                    {formatPollution(totalPollution)}
                  </span>
                </div>
              </div>

              <div className={recipeStyles['recipe-node-info__col--right']}>
                <button
                  className={`${styles['group-node__expand-trigger']} nodrag`}
                  data-tutorial-group-node-id={id}
                  data-tutorial-group-part="expand"
                  onClick={(e) => {
                    const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
                    if (isDeleteMode) {
                      e.stopPropagation();
                      useFlowStore.getState().deleteNode(id);
                      return;
                    }
                    e.stopPropagation();
                    if (
                      isTutorialActive() &&
                      !canPerformTutorialAction({ type: 'group-expand', groupId: id })
                    ) {
                      return;
                    }
                    updateGroupNodeData(id, { collapsed: false });
                    completeTutorialAction({ type: 'group-expand', groupId: id });
                  }}
                >
                  <span className={styles['group-node__expand-label']}>EXPAND</span>
                  <ChevronRight size={14} className={styles['group-node__expand-icon']} />
                </button>
              </div>
            </div>
          </div>

          <GroupNodeIO
            nodeId={id}
            inputProxyHandleIds={data.inputProxyHandleIds}
            outputProxyHandleIds={data.outputProxyHandleIds}
          />
        </div>

        {isEditorOpen && (
          <GroupNodeEditor initialData={data} nodeId={id} onClose={() => setIsEditorOpen(false)} />
        )}
      </>
    );
  }

  const style = {
    '--group-height': `${height ?? EMPTY_GROUP_HEIGHT}px`,
    '--group-header-height': `${GROUP_HEADER_HEIGHT}px`,
    '--group-width': `${width ?? EMPTY_GROUP_WIDTH}px`,
  } as CSSProperties;

  return (
    <>
      <div
        className={styles['group-node']}
        style={style}
        data-tutorial-node-id={id}
        data-db-version={dbVersion}
      >
        <div className={styles['group-node__boundary']}>
          <div className={styles['group-node__header']}>
            <button
              className={styles['group-node__bar']}
              data-tutorial-group-node-id={id}
              data-tutorial-group-part="bar"
              onClick={(event) => {
                const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
                if (isDeleteMode) {
                  event.stopPropagation();
                  useFlowStore.getState().deleteNode(id);
                  return;
                }
                event.stopPropagation();
                if (
                  isTutorialActive() &&
                  !canPerformTutorialAction({ type: 'group-collapse', groupId: id })
                ) {
                  return;
                }
                if (!data.collapsed) {
                  updateGroupNodeData(id, { collapsed: true });
                  completeTutorialAction({ type: 'group-collapse', groupId: id });
                }
              }}
            >
              <span className={styles['group-node__label']}>{data.label}</span>
              <span className={styles['group-node__chevron']}>
                <ChevronDown size={14} />
              </span>
            </button>
            <button
              className={`${styles['group-node__edit-button']} nodrag`}
              data-tutorial-group-node-id={id}
              data-tutorial-group-part="edit"
              onClick={(event) => {
                const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
                if (isDeleteMode) {
                  event.stopPropagation();
                  useFlowStore.getState().deleteNode(id);
                  return;
                }
                event.stopPropagation();
                if (isTutorialActive()) return;
                setIsEditorOpen(true);
              }}
            >
              <Ellipsis size={14} />
            </button>
          </div>
        </div>
      </div>

      {isEditorOpen && (
        <GroupNodeEditor initialData={data} nodeId={id} onClose={() => setIsEditorOpen(false)} />
      )}
    </>
  );
}
