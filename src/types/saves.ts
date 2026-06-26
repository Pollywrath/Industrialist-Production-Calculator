export interface SavedRecipeNode {
  id: string;
  type?: 'recipe';
  recipeId: string;
  machineCount: number;
  inputOrder?: number[];
  outputOrder?: number[];
  position: { x: number; y: number };
  settings?: Record<string, unknown>;
  isTarget?: boolean;
  groupId?: string;
  hidden?: boolean;
}

export interface SavedGroupNode {
  id: string;
  type: 'group';
  label: string;
  collapsed: boolean;
  handlesReady?: boolean;
  inputProxyHandleIds: string[];
  outputProxyHandleIds: string[];
  position: { x: number; y: number };
}

export type SavedNode = SavedRecipeNode | SavedGroupNode;

export interface SavedEdge {
  id: string;
  source: string;
  sourceIndex: number;
  target: string;
  targetIndex: number;
  controlPoints?: { x: number; y: number }[];
  orthogonalTurns?: { x: number; y: number }[];
  hidden?: boolean;
}

export interface GlobalSettings {
  global_pollution: number;
  difficulty?: string;
  unlockedResearchIds?: string[];
  oreNodesEnabled?: boolean;
  showVariantLimited?: boolean;
}

export interface SaveData {
  version: number;
  nodes: SavedNode[];
  edges: SavedEdge[];
  globalSettings?: GlobalSettings;
  dataOverrides?: { id: string; data: Record<string, unknown> }[];
}

export interface SaveRecord {
  id: string;
  name: string;
  timestamp: number;
  data: SaveData;
}

export interface AutosaveRecord {
  id: 'latest';
  timestamp: number;
  data: SaveData;
}
