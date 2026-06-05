import { useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { getProductName, getMachineName, getAllRecipes, getMachine } from '../../../data/lookup';
import { VirtualList } from '../../shared/VirtualList';
import { RecipeCard } from './RecipeCard';
import styles from './RecipeSelector.module.css';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
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
  const unlockedResearchIdsArray = useGlobalSettingsStore((s) => s.settings.unlockedResearchIds);
  const unlockedResearchIds = new Set(unlockedResearchIdsArray);
  const oreNodesEnabled = useGlobalSettingsStore((s) => s.settings.oreNodesEnabled);
  const showVariantLimited = useGlobalSettingsStore((s) => s.settings.showVariantLimited);

  const unlockedRecipes = allRecipes.filter((r) => {
    const machine = getMachine(r.machine_id);
    if (!machine) return true;

    if (machine.research && !unlockedResearchIds.has(machine.research)) {
      return false;
    }
    if (machine.id === 'm_industrial_drill' && !oreNodesEnabled) {
      return false;
    }
    const isVariant = machine.variant && machine.variant !== 'none' && machine.variant !== '';
    const isLimited = machine.limited;
    if (!showVariantLimited && (isVariant || isLimited)) {
      return false;
    }

    return true;
  });

  const {
    activeTab,
    selectedId,
    filterProducers,
    setFilterProducers,
    filterConsumers,
    setFilterConsumers,
    filterSellTrash,
    setFilterSellTrash,
    filterHeatPower,
    setFilterHeatPower,
    handleBack,
    matchingRecipes,
  } = useRecipeSelectorFilters({ recipes: unlockedRecipes });

  const effectivePreselectedProductId = activeTab === 'product' ? selectedId : preselectedProductId;

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

      const machineA = getMachineName(a.r.machine_id) || '';
      const machineB = getMachineName(b.r.machine_id) || '';
      const machineCmp = machineA.localeCompare(machineB);
      if (machineCmp !== 0) {
        return machineCmp;
      }

      const nameCmp = a.r.name.localeCompare(b.r.name);
      if (nameCmp !== 0) {
        return nameCmp;
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
          <button
            className={`${styles['recipe-selector-filter-btn']} ${filterSellTrash ? styles['is-active'] : ''}`}
            onClick={() => setFilterSellTrash(!filterSellTrash)}
          >
            <span className={`${styles['filter-btn-dot']} ${styles['sell']}`} />
            Outlet
          </button>
          <button
            className={`${styles['recipe-selector-filter-btn']} ${filterHeatPower ? styles['is-active'] : ''}`}
            onClick={() => setFilterHeatPower(!filterHeatPower)}
          >
            <span className={`${styles['filter-btn-dot']} ${styles['heat']}`} />
            Power & Heat
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
                preselectedProductId={effectivePreselectedProductId}
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
