import { type CSSProperties, useState, useEffect } from 'react';
import { useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Ellipsis } from 'lucide-react';
import { getEffectiveToggleId, useUIStore } from '../../../stores/useUIStore';
import { useFlowStore } from '../../../stores/useFlowStore';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
import { isRecipeNode } from '../../../types/nodes';
import type { GroupNodeType } from '../../../types/nodes';
import { getMachine, resolveActiveRecipe } from '../../../data/lookup';
import { getSpecialRecipe } from '../../../data/registry';
import {
  formatCurrency,
  formatPower,
  formatPollution,
} from '../../../utils/unitFormatting';
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

export function GroupNode({ id, data, height, width }: NodeProps<GroupNodeType>) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const updateGroupNodeData = useFlowStore((s) => s.updateGroupNodeData);
  const updateNodeInternals = useUpdateNodeInternals();

  const memberNodes = useFlowStore(
    useShallow((s) => s.nodes.filter((n) => isRecipeNode(n) && n.data.groupId === id))
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
    const globalSettings = useGlobalSettingsStore.getState().settings;

    memberNodes.forEach((node) => {
      if (!isRecipeNode(node)) return;
      const recipe = resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id);
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

      if (recipe.power_consumption > 0) {
        totalPower += recipe.power_consumption * machineCount;
      } else if (recipe.power_consumption < 0) {
        totalPower += recipe.power_consumption * machineCount;
      }

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
        >
          <div className={recipeStyles['recipe-node-info']}>
            <button
              className={`${recipeStyles['recipe-node-info__top-right-btn']} nodrag`}
              onClick={(e) => {
                const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
                if (isDeleteMode) {
                  e.stopPropagation();
                  useFlowStore.getState().deleteNode(id);
                  return;
                }
                e.stopPropagation();
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
                  onClick={(e) => {
                    const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
                    if (isDeleteMode) {
                      e.stopPropagation();
                      useFlowStore.getState().deleteNode(id);
                      return;
                    }
                    e.stopPropagation();
                    updateGroupNodeData(id, { collapsed: false });
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
      <div className={styles['group-node']} style={style}>
        <div className={styles['group-node__boundary']}>
          <div className={styles['group-node__header']}>
            <button
              className={styles['group-node__bar']}
              onClick={(event) => {
                const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
                if (isDeleteMode) {
                  event.stopPropagation();
                  useFlowStore.getState().deleteNode(id);
                  return;
                }
                event.stopPropagation();
                if (!data.collapsed) {
                  updateGroupNodeData(id, { collapsed: true });
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
              onClick={(event) => {
                const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
                if (isDeleteMode) {
                  event.stopPropagation();
                  useFlowStore.getState().deleteNode(id);
                  return;
                }
                event.stopPropagation();
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
