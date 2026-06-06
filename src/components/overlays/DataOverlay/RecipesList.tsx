import { useState, useMemo } from 'react';
import { Search, Plus, X, ChevronRight, ChevronDown } from 'lucide-react';
import { VirtualList } from '../../shared/VirtualList';
import {
  getAllMachines,
  getAllRecipes,
  isBaselineRecipe,
  hasRecipeOverride,
} from '../../../data/lookup';
import { buildVirtualModularMachines } from '../../../utils/modularMachineFactory';
import type { Recipe } from '../../../types/data';
import { useDataStore, overlayPendingEdit } from '../../../stores/useDataStore';
import styles from './RecipesTab.module.css';

interface RecipesListProps {
  selectedRecipeId: string | null;
  onSelectRecipe: (id: string | null) => void;
}

interface RecipeVirtualItem {
  key: string;
  type: 'machine' | 'recipe';
  id: string; // machineId or recipeId
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
  const addRecipe = useDataStore((s) => s.addRecipe);
  const dbVersion = useDataStore((s) => s.dbVersion);

  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());

  const toggleMachineExpanded = (machineId: string) => {
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
    // Generate a default recipe
    const newId = addRecipe('New Recipe');
    // Default machine_id for new recipes is m_assembler, let's expand it
    setExpandedMachines((prev) => {
      const next = new Set(prev);
      next.add('m_assembler');
      return next;
    });
    onSelectRecipe(newId);
  };

  const compiledRecipes = useMemo(() => {
    if (dbVersion === -1) return [];

    const baseline = getAllRecipes();
    const pendingRecipes = pendingEdits.recipes;

    // Merge baseline with pending
    const items = baseline
      .map((item) => overlayPendingEdit(item, pendingRecipes[item.id]))
      .filter((item): item is Recipe => item !== null);

    // Append newly added pending recipes
    const newItems = Object.values(pendingRecipes).filter(
      (item) => item._isNew && !item._tombstone,
    ) as Recipe[];

    return [...items, ...newItems];
  }, [dbVersion, pendingEdits.recipes]);

  const machines = useMemo(() => {
    if (dbVersion === -1) return [];
    const baseMachines = getAllMachines();
    const virtuals = buildVirtualModularMachines(baseMachines);
    return [...baseMachines, ...virtuals];
  }, [dbVersion]);

  // Generate virtual list items
  const virtualItems = useMemo(() => {
    const list: RecipeVirtualItem[] = [];
    const query = searchQuery.toLowerCase().trim();

    // Group recipes by machine_id
    const recipeGroups = new Map<string, Recipe[]>();
    compiledRecipes.forEach((recipe) => {
      const mId = recipe.machine_id || 'unassigned';
      let group = recipeGroups.get(mId);
      if (!group) {
        group = [];
        recipeGroups.set(mId, group);
      }
      group.push(recipe);
    });

    // Also sort recipes within each group by id/name
    recipeGroups.forEach((group) => {
      group.sort((a, b) => a.name.localeCompare(b.name));
    });

    // Create a special unassigned category for recipes without active machine
    const allMachines = [...machines];
    const hasUnassigned = Array.from(recipeGroups.keys()).some(
      (mId) => !machines.some((m) => m.id === mId),
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

    // Sort machines alphabetically by name, keeping 'unassigned' at the bottom
    allMachines.sort((a, b) => {
      if (a.id === 'unassigned') return 1;
      if (b.id === 'unassigned') return -1;
      return a.name.localeCompare(b.name);
    });

    // Filter and build list
    allMachines.forEach((machine) => {
      const machineRecipes = recipeGroups.get(machine.id) || [];
      if (machineRecipes.length === 0 && machine.id !== 'm_assembler') {
        // Skip machines with no recipes, except m_assembler (where adding new goes by default)
        return;
      }

      // Check search match
      const machineMatches =
        machine.name.toLowerCase().includes(query) || machine.id.toLowerCase().includes(query);

      const matchedRecipes = machineRecipes.filter(
        (recipe) =>
          recipe.name.toLowerCase().includes(query) || recipe.id.toLowerCase().includes(query),
      );

      // If search query active and nothing matches, skip
      if (query && !machineMatches && matchedRecipes.length === 0) {
        return;
      }

      const isExpanded = query ? true : expandedMachines.has(machine.id);

      list.push({
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
          list.push({
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

    // Sort machines by name
    return list;
  }, [machines, compiledRecipes, searchQuery, expandedMachines]);

  return (
    <div className={styles['sidebar-pane']}>
      <div className={styles['sidebar-toolbar']}>
        <div className={styles['search-box']}>
          <Search className={styles['search-icon']} size={14} />
          <input
            type="text"
            className={styles['search-input']}
            placeholder="Search recipes or machines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={styles['search-clear']}
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <button
          className={styles['btn-add-recipe']}
          onClick={handleAddNew}
          title="Add Custom Recipe"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className={styles['list-viewport']}>
        <VirtualList<RecipeVirtualItem>
          items={virtualItems}
          itemHeight={36}
          height={500}
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

            // Recipe Item
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
                onClick={() => onSelectRecipe(recipe.id)}
              >
                <div className={styles['recipe-row-left']}>
                  <span className={styles['recipe-name']}>{recipe.name}</span>
                  {isNew && <span className={styles['badge-new']}>New</span>}
                  {isPending && <span className={styles['badge-pending']}>Pending</span>}
                  {isModified && !isPending && (
                    <span className={styles['badge-modified']}>Edited</span>
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
