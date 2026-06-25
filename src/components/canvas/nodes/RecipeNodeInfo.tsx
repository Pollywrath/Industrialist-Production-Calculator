import { Ellipsis } from 'lucide-react';
import type { Recipe } from '../../../types/data';
import { useUIStore, getEffectiveToggleId } from '../../../stores/useUIStore';
import { getSpecialRecipe } from '../../../data/registry';
import { getNormalizedCycleTime } from '../../../utils/recipeComputation';
import {
  formatPollution,
  formatTime,
  formatMachineCount,
  formatTemperature,
} from '../../../utils/unitFormatting';
import { formatRecipePowerLine } from '../../../utils/recipePower';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
} from '../../../stores/useTutorialStore';
import styles from './RecipeNode.module.css';

interface RecipeNodeInfoProps {
  recipe: Recipe | undefined;
  machineName: string;
  machineCount: number;
  onOpenEditor: () => void;
  receivedTemp?: number | null;
  machineTier?: number;
  isTarget?: boolean;
  nodeId: string;
}

export function RecipeNodeInfo({
  recipe,
  machineName,
  machineCount,
  onOpenEditor,
  receivedTemp,
  machineTier = 1,
  isTarget = false,
  nodeId,
}: RecipeNodeInfoProps) {
  const rateMode = useUIStore((s) => s.rateMode);
  const displayCycleTime = recipe ? getNormalizedCycleTime(recipe.cycle_time, rateMode) : 0;
  const sr = recipe ? getSpecialRecipe(recipe.id) : undefined;
  const pollutionMultiplier = sr?.pollutionIndependentOfMachineCount ? 1 : machineCount;

  const handleBtnClick = (e: React.MouseEvent) => {
    const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
    if (isDeleteMode) {
      return;
    }
    e.stopPropagation();
    if (isTutorialActive()) {
      if (!canPerformTutorialAction({ type: 'node-editor-open', nodeId })) return;
      onOpenEditor();
      completeTutorialAction({ type: 'node-editor-open', nodeId });
      return;
    }
    onOpenEditor();
  };

  const displayName = recipe?.name || 'Unknown Recipe';

  return (
    <div className={styles['recipe-node-info']}>
      <div className={styles['recipe-node-info__badges']}>
        {isTarget && (
          <div className={styles['recipe-node-info__target-badge']}>
            TARGET
          </div>
        )}
      </div>
      {receivedTemp !== undefined && receivedTemp !== null && (
        <div className={styles['recipe-node-info__temp-badge-anchor']}>
          <div className={styles['recipe-node-info__temp-badge']}>
            {formatTemperature(receivedTemp)}
          </div>
        </div>
      )}
      <button
        className={styles['recipe-node-info__top-right-btn']}
        onClick={handleBtnClick}
        data-tutorial-node-editor-button={nodeId}
      >
        <Ellipsis size={14} />
      </button>
      <div className={styles['recipe-node-info__title']}>{displayName}</div>

      <div className={styles['recipe-node-info__stats']}>
        <div className={styles['recipe-node-info__col--left']}>
          <div className={styles['recipe-node-info__stat']}>
            <span className={styles['recipe-node-info__stat-label']}>Cycle: </span>
            <span className={styles['recipe-node-info__stat-value']}>
              {formatTime(displayCycleTime)}
            </span>
          </div>
          <div className={`${styles['recipe-node-info__stat']} ${styles['recipe-node-info__stat--power']}`}>
            <span className={styles['recipe-node-info__stat-label']}>Power: </span>
            <span className={styles['recipe-node-info__stat-value']}>
              {recipe ? formatRecipePowerLine(recipe, machineCount) : '0 MF/s'}
            </span>
          </div>
          <div className={styles['recipe-node-info__stat']}>
            <span className={styles['recipe-node-info__stat-label']}>Pollution: </span>
            <span className={styles['recipe-node-info__stat-value']}>
              {formatPollution((recipe?.pollution ?? 0) * pollutionMultiplier)}
            </span>
          </div>
        </div>

        <div className={styles['recipe-node-info__col--right']}>
          <div className={`${styles['recipe-node-info__machine-name']} ${styles[`tier-${machineTier}`]}`}>
            {machineName}
          </div>
          <div className={styles['recipe-node-info__machine-count']}>
            {formatMachineCount(machineCount)}
          </div>
        </div>
      </div>
    </div>
  );
}
