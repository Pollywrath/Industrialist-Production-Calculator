import type { Recipe } from '../../../types/data';
import { useUIStore, getEffectiveToggleId } from '../../../stores/useUIStore';
import { getNormalizedCycleTime } from '../../../utils/recipeComputation';
import {
  formatPollution,
  formatPower,
  formatTime,
  formatMachineCount,
} from '../../../utils/unitFormatting';
import styles from './RecipeNode.module.css';

interface RecipeNodeInfoProps {
  recipe: Recipe | undefined;
  machineName: string;
  machineCount: number;
  onOpenEditor: () => void;
}

export function RecipeNodeInfo({
  recipe,
  machineName,
  machineCount,
  onOpenEditor,
}: RecipeNodeInfoProps) {
  const rateMode = useUIStore((s) => s.rateMode);
  const displayCycleTime = recipe ? getNormalizedCycleTime(recipe.cycle_time, rateMode) : 0;

  const handleBtnClick = (e: React.MouseEvent) => {
    const isDeleteMode = getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
    if (isDeleteMode) {
      return;
    }
    e.stopPropagation();
    onOpenEditor();
  };

  const displayName = recipe?.name || 'Unknown Recipe';

  return (
    <div className={styles['recipe-node-info']}>
      <button
        className={styles['recipe-node-info__top-right-btn']}
        onClick={handleBtnClick}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="1"></circle>
          <circle cx="19" cy="12" r="1"></circle>
          <circle cx="5" cy="12" r="1"></circle>
        </svg>
      </button>
      <div className={styles['recipe-node-info__title']}>
        {displayName}
      </div>

      <div className={styles['recipe-node-info__stats']}>
        <div className={styles['recipe-node-info__col--left']}>
          <div className={styles['recipe-node-info__stat']}>
            <span className={styles['recipe-node-info__stat-label']}>Cycle: </span>
            <span className={styles['recipe-node-info__stat-value']}>
              {formatTime(displayCycleTime)}
            </span>
          </div>
          <div className={styles['recipe-node-info__stat']}>
            <span className={styles['recipe-node-info__stat-label']}>Power: </span>
            <span className={styles['recipe-node-info__stat-value']}>
              {formatPower((recipe?.power_consumption ?? 0) * machineCount)}
            </span>
          </div>
          <div className={styles['recipe-node-info__stat']}>
            <span className={styles['recipe-node-info__stat-label']}>Pollution: </span>
            <span className={styles['recipe-node-info__stat-value']}>
              {formatPollution((recipe?.pollution ?? 0) * machineCount)}
            </span>
          </div>
        </div>

        <div className={styles['recipe-node-info__col--right']}>
          <div className={styles['recipe-node-info__machine-name']}>
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
