import { useState } from 'react';
import { Search, Plus, X, ChevronRight, ChevronDown } from 'lucide-react';
import { VirtualList } from '../../shared/VirtualList';
import {
  getAllMachines,
  getAllRecipes,
  isBaselineRecipe,
  hasRecipeOverride,
} from '../../../data/lookup';
import { buildVirtualModularMachines } from '../../../utils/modularMachineFactory';
import type { Machine, Recipe } from '../../../types/data';
import { useDataStore, overlayPendingEdit } from '../../../stores/useDataStore';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';
import crudStyles from './DataCrud.module.css';
import styles from './RecipesTab.module.css';

interface RecipesListProps {
  selectedRecipeId: string | null;
  onSelectRecipe: (id: string | null) => void;
}

interface RecipeVirtualItem {
  key: string;
  type: 'machine' | 'recipe';
  id: string;
  name: string;
  machineId?: string;
  recipe?: Recipe;
  isExpanded?: boolean;
  recipeCount?: number;
}

export function RecipesList({ selectedRecipeId, onSelectRecipe }: RecipesListProps) {
  const pendingEdits = useDataStore((s) => s.pendingEdits);
  const searchQuery = useDataStore((s) => s.searchQuery);
  const setSearchQuery = useDataStore((s) => s.setSearchQuery);
  const customOnly = useDataStore((s) => s.customOnly);
  const setCustomOnly = useDataStore((s) => s.setCustomOnly);
  const addRecipe = useDataStore((s) => s.addRecipe);
  const dbVersion = useDataStore((s) => s.dbVersion);

  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());

  const toggleMachineExpanded = (machineId: string) => {
    if (isTutorialActive()) return;
    setExpandedMachines((prev) => {
      const next = new Set(prev);
      if (next.has(machineId)) {
        next.delete(machineId);
      } else {
        next.add(machineId);
      }
      return next;
    });
  };

  const handleAddNew = () => {
    if (isTutorialActive() && !canPerformTutorialAction({ type: 'data-add', entity: 'recipe' })) {
      return;
    }
    const newId = addRecipe('New Recipe');
    setExpandedMachines((prev) => {
      const next = new Set(prev);
      next.add('m_assembler');
      return next;
    });
    onSelectRecipe(newId);
    completeTutorialAction({ type: 'data-add', entity: 'recipe', id: newId });
  };

  const handleSearchChange = (value: string) => {
    if (isTutorialActive()) {
      const action = useTutorialStore.getState().getCurrentStep()?.action;
      if (action?.type !== 'data-search' || action.entity !== 'recipe') return;
    }
    setSearchQuery(value);
    completeTutorialAction({ type: 'data-search', entity: 'recipe', query: value });
  };

  const handleRecipeSelect = (id: string) => {
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({ type: 'data-select', entity: 'recipe', id })
    ) {
      return;
    }
    onSelectRecipe(id);
    completeTutorialAction({ type: 'data-select', entity: 'recipe', id });
  };

  const compiledRecipes: Recipe[] = [];
  if (dbVersion !== -1) {
    const baseline = getAllRecipes();
    const pendingRecipes = pendingEdits.recipes;

    for (const item of baseline) {
      const recipe = overlayPendingEdit(item, pendingRecipes[item.id]);
      if (recipe) compiledRecipes.push(recipe);
    }

    const newItems = Object.values(pendingRecipes).filter(
      (item) => item._isNew && !item._tombstone,
    ) as Recipe[];
    compiledRecipes.push(...newItems);
  }

  let displayRecipes = compiledRecipes;
  if (customOnly) {
    displayRecipes = compiledRecipes.filter((recipe) => {
      const isSavedNew = !isBaselineRecipe(recipe.id);
      const isNew = !!(pendingEdits.recipes[recipe.id]?._isNew || isSavedNew);
      const isPending = !!(
        pendingEdits.recipes[recipe.id] &&
        !pendingEdits.recipes[recipe.id]?._isNew &&
        !pendingEdits.recipes[recipe.id]?._tombstone
      );
      const isModified = hasRecipeOverride(recipe.id);
      return isNew || isPending || isModified;
    });
  }

  const machines: Machine[] = [];
  if (dbVersion !== -1) {
    const baseMachines = getAllMachines();
    const virtuals = buildVirtualModularMachines(baseMachines);
    machines.push(...baseMachines, ...virtuals);
  }

  const virtualItems: RecipeVirtualItem[] = [];
  const query = searchQuery.toLowerCase().trim();
  const recipeGroups = new Map<string, Recipe[]>();

  displayRecipes.forEach((recipe) => {
    const mId = recipe.machine_id || 'unassigned';
    let group = recipeGroups.get(mId);
    if (!group) {
      group = [];
      recipeGroups.set(mId, group);
    }
    group.push(recipe);
  });

  recipeGroups.forEach((group) => {
    group.sort((a, b) => a.name.localeCompare(b.name));
  });

  const allMachines = [...machines];
  const hasUnassigned = Array.from(recipeGroups.keys()).some(
    (mId) => !machines.some((machine) => machine.id === mId),
  );
  if (hasUnassigned) {
    allMachines.push({
      id: 'unassigned',
      name: 'Unassigned / Other',
      cost: 0,
      tier: 1,
      size: { x: 1, y: 1 },
      variant: '',
      limited: false,
      research: '',
      category: 'Factory',
      subcategory: 'Assembler',
    });
  }

  allMachines.sort((a, b) => {
    if (a.id === 'unassigned') return 1;
    if (b.id === 'unassigned') return -1;
    return a.name.localeCompare(b.name);
  });

  allMachines.forEach((machine) => {
    const machineRecipes = recipeGroups.get(machine.id) || [];
    if (machineRecipes.length === 0 && machine.id !== 'm_assembler') {
      return;
    }

    const machineMatches =
      machine.name.toLowerCase().includes(query) || machine.id.toLowerCase().includes(query);

    const matchedRecipes = machineRecipes.filter(
      (recipe) =>
        recipe.name.toLowerCase().includes(query) || recipe.id.toLowerCase().includes(query),
    );

    if (query && !machineMatches && matchedRecipes.length === 0) {
      return;
    }

    const isExpanded = query ? true : expandedMachines.has(machine.id);

    virtualItems.push({
      key: `machine-${machine.id}`,
      type: 'machine',
      id: machine.id,
      name: machine.name,
      isExpanded,
      recipeCount: machineRecipes.length,
    });

    if (isExpanded) {
      const recipesToShow = query ? matchedRecipes : machineRecipes;
      recipesToShow.forEach((recipe) => {
        virtualItems.push({
          key: `recipe-${recipe.id}`,
          type: 'recipe',
          id: recipe.id,
          name: recipe.name,
          machineId: machine.id,
          recipe,
        });
      });
    }
  });

  return (
    <div className={crudStyles['sidebar-pane']}>
      <div className={crudStyles['sidebar-filter-header']}>
        <label className={crudStyles['sidebar-filter-label']}>
          <input
            type="checkbox"
            className={crudStyles['form-checkbox']}
            checked={customOnly}
            onChange={(e) => {
              if (isTutorialActive()) return;
              setCustomOnly(e.target.checked);
            }}
          />
          <span>Show Custom Only</span>
        </label>
      </div>
      <div className={crudStyles['sidebar-toolbar']}>
        <div className={crudStyles['search-box']}>
          <Search className={crudStyles['search-icon']} size={14} />
          <input
            type="text"
            className={crudStyles['search-input']}
            placeholder="Search recipes or machines..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            data-tutorial-data-search="recipe"
          />
          {searchQuery && (
            <button
              className={crudStyles['search-clear']}
              onClick={() => {
                if (isTutorialActive()) return;
                setSearchQuery('');
              }}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          className={crudStyles['btn-add']}
          onClick={handleAddNew}
          title="Add Custom Recipe"
          data-tutorial-data-add="recipe"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className={crudStyles['list-viewport']}>
        <VirtualList<RecipeVirtualItem>
          items={virtualItems}
          itemHeight={36}
          height={460}
          getKey={(item) => item.key}
        >
          {(item) => {
            if (item.type === 'machine') {
              return (
                <div
                  className={styles['machine-header-row']}
                  onClick={() => toggleMachineExpanded(item.id)}
                >
                  <div className={styles['machine-header-left']}>
                    {item.isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span className={styles['machine-name-label']}>{item.name}</span>
                  </div>
                  <span className={styles['machine-recipe-count']}>({item.recipeCount})</span>
                </div>
              );
            }

            const recipe = item.recipe!;
            const isSelected = selectedRecipeId === recipe.id;
            const isSavedNew = !isBaselineRecipe(recipe.id);
            const isNew = !!(pendingEdits.recipes[recipe.id]?._isNew || isSavedNew);
            const isPending = !!(
              pendingEdits.recipes[recipe.id] &&
              !pendingEdits.recipes[recipe.id]?._isNew &&
              !pendingEdits.recipes[recipe.id]?._tombstone
            );
            const isModified = hasRecipeOverride(recipe.id);

            return (
              <div
                className={`${styles['recipe-item-row']} ${isSelected ? styles['is-selected'] : ''}`}
                data-new={isNew ? 'true' : undefined}
                data-modified={isModified ? 'true' : undefined}
                data-pending={isPending ? 'true' : undefined}
                data-tutorial-data-row={`recipe:${recipe.id}`}
                onClick={() => handleRecipeSelect(recipe.id)}
              >
                <div className={styles['recipe-row-left']}>
                  <span className={styles['recipe-name']}>{recipe.name}</span>
                  {isNew && <span className={crudStyles['badge-new']}>New</span>}
                  {isPending && <span className={crudStyles['badge-pending']}>Pending</span>}
                  {isModified && !isPending && (
                    <span className={crudStyles['badge-modified']}>Edited</span>
                  )}
                </div>
                <span className={styles['recipe-id']}>{recipe.id}</span>
              </div>
            );
          }}
        </VirtualList>
      </div>
    </div>
  );
}
