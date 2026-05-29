export interface SavedNode {
  id: string;
  recipeId: string;
  machineCount: number;
  inputOrder?: number[];
  outputOrder?: number[];
  position: { x: number; y: number };
  settings?: Record<string, unknown>;
  isTarget?: boolean;
}

export interface SavedEdge {
  id: string;
  source: string;
  sourceIndex: number;
  target: string;
  targetIndex: number;
  controlPoints?: { x: number; y: number }[];
  orthogonalTurns?: { x: number; y: number }[];
}

export interface GlobalSettings {
  global_pollution: number;
}

export interface SaveData {
  version: number;
  nodes: SavedNode[];
  edges: SavedEdge[];
  globalSettings?: GlobalSettings;
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
