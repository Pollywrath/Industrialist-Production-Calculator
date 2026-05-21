import { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { getProductName, getMachineName, getAllRecipes } from '../../../data/lookup';
import { VirtualList } from '../../shared/VirtualList';
import { RecipeCard } from './RecipeCard';
import styles from './RecipeSelector.module.css';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { useRecipeSelectorFilters } from './RecipeSelectorContext';

interface RecipeStageProps {
  clickedRateInfo: { clickedPerSecondRate: number } | null;
  preselectedSourceSide: 'input' | 'output' | null;
  preselectedProductId: string | null;
  onAddRecipe: (recipeId: string) => void;
}

export function RecipeStage({
  clickedRateInfo,
  preselectedSourceSide,
  preselectedProductId,
  onAddRecipe,
}: RecipeStageProps) {
  const dbVersion = useDataStore((s) => s.dbVersion);
  const allRecipes = dbVersion !== -1 ? getAllRecipes() : [];

  const {
    activeTab,
    selectedId,
    filterProducers,
    setFilterProducers,
    filterConsumers,
    setFilterConsumers,
    handleBack,
    matchingRecipes,
  } = useRecipeSelectorFilters({ recipes: allRecipes });

  const rateMode = useUIStore((s) => s.rateMode);
  const setRecipeSelectorOpen = useUIStore((s) => s.setRecipeSelectorOpen);

  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('favorite_recipes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
      }
    } catch (e) {
      console.error('Error loading favorite_recipes:', e);
    }
    return new Set();
  });

  const handleToggleFavorite = (recipeId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) {
        next.delete(recipeId);
      } else {
        next.add(recipeId);
      }
      try {
        localStorage.setItem('favorite_recipes', JSON.stringify(Array.from(next)));
      } catch (e) {
        console.error('Error saving favorite_recipes:', e);
      }
      return next;
    });
  };

  const sortedRecipes = [...matchingRecipes]
    .map((r, index) => ({ r, index }))
    .sort((a, b) => {
      const aFav = favorites.has(a.r.id) ? 1 : 0;
      const bFav = favorites.has(b.r.id) ? 1 : 0;
      if (aFav !== bFav) {
        return bFav - aFav;
      }
      return a.index - b.index;
    })
    .map((x) => x.r);
  return (
    <>
      <div className={styles['recipe-selector-header']}>
        <div className={styles['recipe-selector-back-nav']}>
          <button className={styles['recipe-selector-back-btn']} onClick={handleBack}>
            <ArrowLeft size={14} className={styles['back-btn-icon']} />
            <span className={styles['back-btn-text']}>
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
          onClick={() => setRecipeSelectorOpen(false)}
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
          <button className={styles['recipe-selector-filter-btn']} disabled={true}>
            <span className={`${styles['filter-btn-dot']} ${styles['sell']}`} />
            Sell/Trash (Soon)
          </button>
          <button className={styles['recipe-selector-filter-btn']} disabled={true}>
            <span className={`${styles['filter-btn-dot']} ${styles['heat']}`} />
            Heat/Power (Soon)
          </button>
        </div>
      )}

      <div className={styles['recipe-selector-content-stage2']}>
        {sortedRecipes.length === 0 ? (
          <div className={styles['recipe-selector-empty']}>No recipes found.</div>
        ) : (
          <VirtualList
            items={sortedRecipes}
            itemHeight={136}
            height={activeTab === 'product' ? 488 : 540}
            overscan={5}
            getKey={(recipe) => recipe.id}
            className={styles['recipe-selector-table-viewport']}
          >
            {(recipe) => (
              <RecipeCard
                recipe={recipe}
                rateMode={rateMode}
                clickedRateInfo={clickedRateInfo}
                preselectedSourceSide={preselectedSourceSide}
                preselectedProductId={preselectedProductId}
                onAddRecipe={onAddRecipe}
                isFavorite={favorites.has(recipe.id)}
                onToggleFavorite={handleToggleFavorite}
              />
            )}
          </VirtualList>
        )}
      </div>
    </>
  );
}
