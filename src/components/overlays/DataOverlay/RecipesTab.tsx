import { useState } from 'react';
import { RecipesList } from './RecipesList';
import { RecipeForm } from './RecipeForm';
import styles from './RecipesTab.module.css';

export function RecipesTab() {
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  return (
    <div className={styles['recipes-tab-container']}>
      <RecipesList selectedRecipeId={selectedRecipeId} onSelectRecipe={setSelectedRecipeId} />
      <RecipeForm selectedRecipeId={selectedRecipeId} onSelectRecipe={setSelectedRecipeId} />
    </div>
  );
}
