import type { Recipe } from '../../../types/data';
import useControlStore from '../../../stores/useControlStore';
import {
  getNormalizedCycleTime,
  showCycleTime,
  showMachineCount,
} from '../../../utils/recipeComputation';
import styles from './RecipeNode.module.css';

interface RecipeNodeInfoProps {
  recipe: Recipe | undefined;
  machineName: string;
  machineCount: number;
  customName?: string;
  onOpenEditor: () => void;
}

export default function RecipeNodeInfo({
  recipe,
  machineName,
  machineCount,
  customName,
  onOpenEditor,
}: RecipeNodeInfoProps) {
  const rateMode = useControlStore((s) => s.rateMode);
  const displayCycleTime = recipe ? getNormalizedCycleTime(recipe.cycle_time, rateMode) : 0;

  const handleBtnClick = (e: React.MouseEvent) => {
    const isDeleteMode = useControlStore.getState().activeToggles['delete_mode'];
    if (isDeleteMode) {
      return;
    }
    e.stopPropagation();
    onOpenEditor();
  };

  const displayName = customName || recipe?.name || 'Unknown Recipe';

  return (
    <div className={styles['recipe-node-info']}>
      <button
        className={styles['recipe-node-info__top-right-btn']}
        aria-label="Node options"
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
      <div className={styles['recipe-node-info__title']} title={displayName}>
        {displayName}
      </div>

      <div className={styles['recipe-node-info__stats']}>
        <div className={styles['recipe-node-info__col--left']}>
          <div className={styles['recipe-node-info__stat']}>
            <span className={styles['recipe-node-info__stat-label']}>Cycle: </span>
            <span className={styles['recipe-node-info__stat-value']}>
              {showCycleTime(displayCycleTime)}
            </span>
          </div>
          <div className={styles['recipe-node-info__stat']}>
            <span className={styles['recipe-node-info__stat-label']}>Power: </span>
            <span className={styles['recipe-node-info__stat-value']}>
              {Number(((recipe?.power_consumption ?? 0) * machineCount).toFixed(2))}
            </span>
          </div>
          <div className={styles['recipe-node-info__stat']}>
            <span className={styles['recipe-node-info__stat-label']}>Pollution: </span>
            <span className={styles['recipe-node-info__stat-value']}>
              {Number(((recipe?.pollution ?? 0) * machineCount).toFixed(2))}
            </span>
          </div>
        </div>

        <div className={styles['recipe-node-info__col--right']}>
          <div className={styles['recipe-node-info__machine-name']} title={machineName}>
            {machineName}
          </div>
          <div className={styles['recipe-node-info__machine-count']}>
            {showMachineCount(machineCount)}
          </div>
        </div>
      </div>
    </div>
  );
}
