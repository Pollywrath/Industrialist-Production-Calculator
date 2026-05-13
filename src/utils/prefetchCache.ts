import type React from 'react';
import type { RecipeNodeType } from '../types/nodes';
import type { Recipe } from '../types/data';

export interface NodeEditorProps {
  recipe: Recipe;
  initialData: RecipeNodeType['data'];
  nodeId: string;
  onClose: () => void;
}

export const prefetchCache = {
  RecipeSelector: null as React.ComponentType<Record<string, never>> | null,
  NodeEditor: null as React.ComponentType<NodeEditorProps> | null,
  SavesOverlay: null as React.ComponentType<Record<string, never>> | null,
};
