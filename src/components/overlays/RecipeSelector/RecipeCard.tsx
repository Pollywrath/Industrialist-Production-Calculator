import { useState } from 'react';
import type { Recipe } from '../../../types/data';
import { getProductIconPath } from '../../../data/productIcons';
import { getMachineName, getProductName, getProduct, getMachine, resolveActiveRecipe } from '../../../data/lookup';
import { getSpecialRecipe } from '../../../data/registry';
import {
  getRateMultiplier,
  getNormalizedCycleTime,
  calculateMachineCountFromRate,
} from '../../../utils/recipeComputation';
import {
  formatPollution,
  formatPower,
  formatTime,
  formatQuantity,
  formatMachineCount,
} from '../../../utils/unitFormatting';
import { Star } from 'lucide-react';
import styles from './RecipeSelector.module.css';

interface RecipeCardProps {
  recipe: Recipe;
  rateMode: 'second' | 'minute' | 'hour' | 'raw';
  clickedRateInfo: { clickedPerSecondRate: number } | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedProductId: string | null;
  onAddRecipe: (recipeId: string) => void;
  isFavorite: boolean;
  onToggleFavorite: (recipeId: string) => void;
}

function ProductIcon({ productId, productName }: { productId: string; productName: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return <>{productName.charAt(0).toUpperCase()}</>;
  }

  return (
    <img
      src={getProductIconPath(productId) || ''}
      alt={productName}
      loading="lazy"
      decoding="async"
      style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }}
      onError={() => setError(true)}
    />
  );
}

export function RecipeCard({
  recipe: initialRecipe,
  rateMode,
  clickedRateInfo,
  preselectedSourceSide,
  preselectedProductId,
  onAddRecipe,
  isFavorite,
  onToggleFavorite,
}: RecipeCardProps) {
  let recipe = initialRecipe;
  if (preselectedProductId) {
    const sr = getSpecialRecipe(initialRecipe.id);
    if (sr && sr.resolveSettings) {
      const customSettings = sr.resolveSettings(preselectedProductId);
      if (customSettings) {
        recipe = resolveActiveRecipe(initialRecipe.id, customSettings) || initialRecipe;
      }
    }
  }

  const multiplier = getRateMultiplier(recipe.cycle_time, rateMode);
  const displayCycleTime = getNormalizedCycleTime(recipe.cycle_time, rateMode);
  const machineTier = getMachine(recipe.machine_id)?.tier || 1;
  let neededMachineCount = 1;

  if (clickedRateInfo) {
    const { clickedPerSecondRate } = clickedRateInfo;
    const targetList = preselectedSourceSide === 'input' ? recipe.outputs : recipe.inputs;

    const preselectedProd = preselectedProductId ? getProduct(preselectedProductId) : null;
    const preselectedType = preselectedProd?.type;

    const isCompatible = (recipeProductId: string) => {
      if (!preselectedProductId) return false;
      if (recipeProductId === preselectedProductId) return true;
      if (recipeProductId === 'any_fluid' || recipeProductId === 'any_item') {
        const recipeProd = getProduct(recipeProductId);
        return recipeProd?.type === preselectedType;
      }
      return false;
    };

    const targetEntry = targetList.find((e) => isCompatible(e.product_id));
    if (targetEntry) {
      const candidateBaseQty = targetEntry.quantity;
      if (candidateBaseQty > 0) {
        neededMachineCount = calculateMachineCountFromRate(
          clickedPerSecondRate,
          recipe.cycle_time,
          candidateBaseQty,
        );
      }
    }
  }

  return (
    <div className={styles['recipe-selector-card']} onClick={() => onAddRecipe(recipe.id)}>
      <div className={styles['recipe-card-top']}>
        <div className={styles['recipe-card-top-left']}>
          <button
            className={`${styles['recipe-card-fav-btn']}${isFavorite ? ` ${styles['is-favorite']}` : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(recipe.id);
            }}
          >
            <Star
              size={14}
              fill={isFavorite ? 'var(--theme-color-primary)' : 'none'}
              color={isFavorite ? 'var(--theme-color-primary)' : 'currentColor'}
            />
          </button>
          <span className={styles['recipe-card-title']}>{recipe.name}</span>
        </div>
        <div className={styles['recipe-card-top-right']}>
          <span className={`${styles['recipe-card-machine-name']} ${styles[`tier-${machineTier}`]}`}>
            {getMachineName(recipe.machine_id)}
          </span>
          <span
            className={`${styles['recipe-card-pollution']} ${recipe.pollution < 0 ? styles['success'] : ''}`.trim()}
          >
            {formatPollution(recipe.pollution * neededMachineCount)}
          </span>
          <span className={styles['recipe-card-machine-count']}>
            {formatMachineCount(neededMachineCount)}
          </span>
        </div>
      </div>

      <div
        className={`${styles['recipe-card-bottom']}${recipe.inputs.length === 0 ? ` ${styles['has-no-inputs']}` : ''}${recipe.outputs.length === 0 ? ` ${styles['has-no-outputs']}` : ''}`}
      >
        {recipe.inputs.length > 0 && (
          <div className={`${styles['recipe-card-col']} ${styles['recipe-card-col-inputs']}`}>
            {recipe.inputs.map((inp) => {
              const productName = getProductName(inp.product_id);
              return (
                <div key={inp.product_id} className={styles['recipe-card-io-item']}>
                  <div className={styles['recipe-card-io-square-wrapper']}>
                    <div className={styles['recipe-card-io-square']}>
                      <ProductIcon productId={inp.product_id} productName={productName} />
                    </div>
                    <span className={styles['recipe-card-io-quantity']}>
                      {formatQuantity(inp.quantity * multiplier * neededMachineCount)}
                    </span>
                  </div>
                  <span className={styles['recipe-card-io-name']}>{productName}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className={`${styles['recipe-card-col']} ${styles['recipe-card-col-arrow']}`}>
          <div className={styles['recipe-card-arrow-container']}>
            <div className={`${styles['recipe-card-arrow-info']} ${styles['above']}`}>
              {formatTime(displayCycleTime)}
            </div>
            <div className={styles['recipe-card-arrow']}>
              <div className={styles['recipe-card-arrow-line']} />
              <div className={styles['recipe-card-arrow-head']} />
            </div>
            <div className={`${styles['recipe-card-arrow-info']} ${styles['below']}`}>
              {formatPower(recipe.power_consumption * neededMachineCount)}
            </div>
          </div>
        </div>

        {recipe.outputs.length > 0 && (
          <div className={`${styles['recipe-card-col']} ${styles['recipe-card-col-outputs']}`}>
            {recipe.outputs.map((out) => {
              const productName = getProductName(out.product_id);
              return (
                <div key={out.product_id} className={styles['recipe-card-io-item']}>
                  <div className={styles['recipe-card-io-square-wrapper']}>
                    <div className={styles['recipe-card-io-square']}>
                      <ProductIcon productId={out.product_id} productName={productName} />
                    </div>
                    <span className={styles['recipe-card-io-quantity']}>
                      {formatQuantity(out.quantity * multiplier * neededMachineCount)}
                    </span>
                  </div>
                  <span className={styles['recipe-card-io-name']}>{productName}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
