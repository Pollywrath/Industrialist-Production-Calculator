import type { Recipe } from '../../../types/data';
import { getMachineName, getProductName } from '../../../data/lookup';
import {
  getRateMultiplier,
  getNormalizedCycleTime,
  showQuantity,
  showCycleTime,
  cleanMachineCount,
  showMachineCount,
} from '../../../utils/recipeComputation';
import styles from './RecipeSelector.module.css';

interface RecipeCardProps {
  recipe: Recipe;
  rateMode: 'second' | 'minute' | 'hour' | 'raw';
  clickedRateInfo: { clickedPerSecondRate: number } | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedProductId: string | null;
  onAddRecipe: (recipeId: string) => void;
}

export default function RecipeCard({
  recipe,
  rateMode,
  clickedRateInfo,
  preselectedSourceSide,
  preselectedProductId,
  onAddRecipe,
}: RecipeCardProps) {
  const multiplier = getRateMultiplier(recipe.cycle_time, rateMode);
  const displayCycleTime = getNormalizedCycleTime(recipe.cycle_time, rateMode);
  let neededMachineCount = 1;

  if (clickedRateInfo) {
    const { clickedPerSecondRate } = clickedRateInfo;
    const targetList = preselectedSourceSide === 'input' ? recipe.outputs : recipe.inputs;
    const targetEntry = targetList.find((e) => e.product_id === preselectedProductId);
    if (targetEntry) {
      const candidateBaseQty = targetEntry.quantity;
      if (candidateBaseQty > 0) {
        neededMachineCount = cleanMachineCount(
          (clickedPerSecondRate * recipe.cycle_time) / candidateBaseQty,
        );
      }
    }
  }

  return (
    <div className={styles['recipe-selector-card']} onClick={() => onAddRecipe(recipe.id)}>
      <div className={styles['recipe-card-top']}>
        <div className={styles['recipe-card-top-left']}>
          <button className={styles['recipe-card-fav-btn']} onClick={(e) => e.stopPropagation()}>
            ☆
          </button>
          <span className={styles['recipe-card-title']}>{recipe.name}</span>
        </div>
        <div className={styles['recipe-card-top-right']}>
          <span className={styles['recipe-card-machine-name']}>
            {getMachineName(recipe.machine_id)}
          </span>
          <span className={styles['recipe-card-pollution']}>
            {Number((recipe.pollution * neededMachineCount).toFixed(2))}
          </span>
          <span className={styles['recipe-card-machine-count']}>
            {showMachineCount(neededMachineCount)}
          </span>
        </div>
      </div>

      <div
        className={`${styles['recipe-card-bottom']}${recipe.inputs.length === 0 ? ` ${styles['has-no-inputs']}` : ''}${recipe.outputs.length === 0 ? ` ${styles['has-no-outputs']}` : ''}`}
      >
        {recipe.inputs.length > 0 && (
          <div className={`${styles['recipe-card-col']} ${styles['recipe-card-col-inputs']}`}>
            {recipe.inputs.map((inp, i) => (
              <div key={i} className={styles['recipe-card-io-item']}>
                <div className={styles['recipe-card-io-square-wrapper']}>
                  <div className={styles['recipe-card-io-square']}>
                    {getProductName(inp.product_id).charAt(0).toUpperCase()}
                  </div>
                  <span className={styles['recipe-card-io-quantity']}>
                    {showQuantity(inp.quantity * multiplier * neededMachineCount)}
                  </span>
                </div>
                <span
                  className={styles['recipe-card-io-name']}
                  title={getProductName(inp.product_id)}
                >
                  {getProductName(inp.product_id)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className={`${styles['recipe-card-col']} ${styles['recipe-card-col-arrow']}`}>
          <div className={styles['recipe-card-arrow-container']}>
            <div className={`${styles['recipe-card-arrow-info']} ${styles['above']}`}>
              {showCycleTime(displayCycleTime)}
            </div>
            <div className={styles['recipe-card-arrow']}>
              <div className={styles['recipe-card-arrow-line']} />
              <div className={styles['recipe-card-arrow-head']} />
            </div>
            <div className={`${styles['recipe-card-arrow-info']} ${styles['below']}`}>
              {Number((recipe.power_consumption * neededMachineCount).toFixed(2))}
            </div>
          </div>
        </div>

        {recipe.outputs.length > 0 && (
          <div className={`${styles['recipe-card-col']} ${styles['recipe-card-col-outputs']}`}>
            {recipe.outputs.map((out, i) => (
              <div key={i} className={styles['recipe-card-io-item']}>
                <div className={styles['recipe-card-io-square-wrapper']}>
                  <div className={styles['recipe-card-io-square']}>
                    {getProductName(out.product_id).charAt(0).toUpperCase()}
                  </div>
                  <span className={styles['recipe-card-io-quantity']}>
                    {showQuantity(out.quantity * multiplier * neededMachineCount)}
                  </span>
                </div>
                <span
                  className={styles['recipe-card-io-name']}
                  title={getProductName(out.product_id)}
                >
                  {getProductName(out.product_id)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
