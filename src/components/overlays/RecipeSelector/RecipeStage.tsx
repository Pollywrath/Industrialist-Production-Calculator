import { ArrowLeft, X } from 'lucide-react';
import type { Recipe } from '../../../types/data';
import type { RateMode } from '../../../stores/useControlStore';
import { getProductName, getMachineName } from '../../../data/lookup';
import VirtualList from '../../shared/VirtualList';
import RecipeCard from './RecipeCard';
import styles from './RecipeSelector.module.css';

interface RecipeStageProps {
  activeTab: 'product' | 'machine';
  selectedId: string | null;
  filterProducers: boolean;
  setFilterProducers: (val: boolean) => void;
  filterConsumers: boolean;
  setFilterConsumers: (val: boolean) => void;
  matchingRecipes: Recipe[];
  rateMode: RateMode;
  clickedRateInfo: { clickedPerSecondRate: number } | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedProductId: string | null;
  onBack: () => void;
  onClose: () => void;
  onAddRecipe: (recipeId: string) => void;
}

export default function RecipeStage({
  activeTab,
  selectedId,
  filterProducers,
  setFilterProducers,
  filterConsumers,
  setFilterConsumers,
  matchingRecipes,
  rateMode,
  clickedRateInfo,
  preselectedSourceSide,
  preselectedProductId,
  onBack,
  onClose,
  onAddRecipe,
}: RecipeStageProps) {
  return (
    <>
      <div className={styles['recipe-selector-header']}>
        <div className={styles['recipe-selector-back-nav']}>
          <button className={styles['recipe-selector-back-btn']} onClick={onBack}>
            <ArrowLeft
              size={14}
              style={{ marginRight: '6px', display: 'inline-block', verticalAlign: 'middle' }}
            />
            <span style={{ verticalAlign: 'middle' }}>
              Back to {activeTab === 'product' ? 'Products' : 'Machines'}
            </span>
          </button>
          <span className={styles['recipe-selector-selected-heading']}>
            {selectedId
              ? activeTab === 'product'
                ? getProductName(selectedId)
                : getMachineName(selectedId)
              : ''}{' '}
            Recipes
          </span>
        </div>
        <button
          className={styles['recipe-selector-close']}
          onClick={onClose}
          title="Close selector"
        >
          <X size={16} />
        </button>
      </div>

      {activeTab === 'product' && (
        <div className={styles['recipe-selector-phase2-filters']}>
          <button
            className={`${styles['recipe-selector-filter-btn']} ${filterProducers ? styles['is-active'] : ''}`}
            onClick={() => setFilterProducers(!filterProducers)}
          >
            <span className={`${styles['filter-btn-dot']} ${styles['producer']}`} />
            Producer
          </button>
          <button
            className={`${styles['recipe-selector-filter-btn']} ${filterConsumers ? styles['is-active'] : ''}`}
            onClick={() => setFilterConsumers(!filterConsumers)}
          >
            <span className={`${styles['filter-btn-dot']} ${styles['consumer']}`} />
            Consumer
          </button>
          <button
            className={styles['recipe-selector-filter-btn']}
            disabled={true}
            title="Filter by Sell/Trash recipes (Coming Soon)"
          >
            <span className={`${styles['filter-btn-dot']} ${styles['sell']}`} />
            Sell/Trash (Soon)
          </button>
          <button
            className={styles['recipe-selector-filter-btn']}
            disabled={true}
            title="Filter by Heat/Power recipes (Coming Soon)"
          >
            <span className={`${styles['filter-btn-dot']} ${styles['heat']}`} />
            Heat/Power (Soon)
          </button>
        </div>
      )}

      <div
        className={styles['recipe-selector-content']}
        style={{ padding: '20px 20px 0 20px', overflow: 'hidden' }}
      >
        {matchingRecipes.length === 0 ? (
          <div className={styles['recipe-selector-empty']}>No recipes found.</div>
        ) : (
          <VirtualList
            items={matchingRecipes}
            itemHeight={130}
            height={activeTab === 'product' ? 488 : 540}
            overscan={5}
            getKey={(recipe) => recipe.id}
          >
            {(recipe) => (
              <RecipeCard
                recipe={recipe}
                rateMode={rateMode}
                clickedRateInfo={clickedRateInfo}
                preselectedSourceSide={preselectedSourceSide}
                preselectedProductId={preselectedProductId}
                onAddRecipe={onAddRecipe}
              />
            )}
          </VirtualList>
        )}
      </div>
    </>
  );
}
