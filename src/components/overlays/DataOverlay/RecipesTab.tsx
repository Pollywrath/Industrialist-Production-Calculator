import { useDataStore } from '../../../stores/useDataStore';
import { RecipesList } from './RecipesList';
import { RecipeForm } from './RecipeForm';
import styles from './RecipesTab.module.css';

export function RecipesTab() {
  const selectedRecipeId = useDataStore((s) => s.selectedRecipeId);
  const setSelectedRecipeId = useDataStore((s) => s.setSelectedRecipeId);

  return (
    <div className={styles['recipes-tab-container']}>
      <RecipesList selectedRecipeId={selectedRecipeId} onSelectRecipe={setSelectedRecipeId} />
      <RecipeForm selectedRecipeId={selectedRecipeId} onSelectRecipe={setSelectedRecipeId} />
    </div>
  );
}
