import type React from 'react';
import type { RecipeNodeType } from '../../types/nodes';
import type { Recipe } from '../../types/data';

export interface NodeEditorProps {
  recipe: Recipe;
  initialData: RecipeNodeType['data'];
  nodeId: string;
  onClose: () => void;
}

export const overlayPrefetchCache = {
  RecipeSelector: null as React.ComponentType<Record<string, never>> | null,
  NodeEditor: null as React.ComponentType<NodeEditorProps> | null,
  SavesOverlay: null as React.ComponentType<Record<string, never>> | null,
  DataOverlay: null as React.ComponentType<Record<string, never>> | null,
  ThemeOverlay: null as React.ComponentType<Record<string, never>> | null,
  MachineOverlay: null as React.ComponentType<Record<string, never>> | null,
  HelpOverlay: null as React.ComponentType<Record<string, never>> | null,
  LPSolverOverlay: null as React.ComponentType<Record<string, never>> | null,
};
