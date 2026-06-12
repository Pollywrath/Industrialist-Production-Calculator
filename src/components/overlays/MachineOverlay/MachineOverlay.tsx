import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
  MarkerType,
} from '@xyflow/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Lock, Settings, Unlock, X } from 'lucide-react';
import { getAllMachines, getAllResearches, getMachine } from '../../../data/lookup';
import { useUIStore } from '../../../stores/useUIStore';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
import { useDashboardStore } from '../../../stores/useDashboardStore';
import { useDataStore } from '../../../stores/useDataStore';
import styles from './MachineOverlay.module.css';

type ResearchCategory = 'Production' | 'Energy' | 'Utility';

interface ResearchGraphNodeData extends Record<string, unknown> {
  name: string;
  rpCost: number;
  unlocked: boolean;
  selected: boolean;
}

interface ResearchGraphEdgeData extends Record<string, unknown> {
  bendPoints?: Array<{ x: number; y: number }>;
}

type CategoryGraphMap = Map<
  ResearchCategory,
  { nodes: Node<ResearchGraphNodeData>[]; edges: Edge<ResearchGraphEdgeData>[] }
>;

const CATEGORY_TABS: ResearchCategory[] = ['Production', 'Energy', 'Utility'];
const RESEARCH_NODE_WIDTH = 220;
const RESEARCH_NODE_HEIGHT = 74;
const FALLBACK_X_GAP = 280;
const FALLBACK_Y_GAP = 114;
const FALLBACK_START_X = 40;
const FALLBACK_START_Y = 40;
const SOURCE_HANDLE_ID = 'source';
const TARGET_HANDLE_ID = 'target';
const EMPTY_GRAPH_NODES: Node<ResearchGraphNodeData>[] = [];
const EMPTY_GRAPH_EDGES: Edge<ResearchGraphEdgeData>[] = [];

type GameDifficulty = 'normal' | 'hard' | 'impossible' | 'impossible2' | 'sandbox' | 'sandbox_plus';

const DIFFICULTY_LABELS: Record<GameDifficulty, string> = {
  normal: 'Normal',
  hard: 'Hard',
  impossible: 'Impossible',
  impossible2: 'Impossible\u00B2',
  sandbox: 'Sandbox',
  sandbox_plus: 'Sandbox+',
};

const DIFFICULTY_OPTIONS: GameDifficulty[] = [
  'normal',
  'hard',
  'impossible',
  'impossible2',
  'sandbox',
  'sandbox_plus',
];

const ALWAYS_UNLOCKED_SEEDS: Record<GameDifficulty, string[]> = {
  normal: [
    's_production_production',
    's_production_coal_extracting',
    's_production_research_station_1',
    's_energy_energy',
    's_energy_renewables',
    's_energy_hand_crank',
    's_energy_solar_panel_1',
    's_energy_low_capacity_infrastructure',
    's_energy_lv_pole',
    's_utility_utility',
    's_utility_transportation',
    's_utility_truck_depot',
    's_utility_pipes',
  ],
  hard: [
    's_production_production',
    's_production_coal_extracting',
    's_production_research_station_1',
    's_energy_energy',
    's_energy_renewables',
    's_energy_solar_panel_1',
    's_energy_low_capacity_infrastructure',
    's_energy_lv_pole',
    's_utility_utility',
    's_utility_transportation',
    's_utility_truck_depot',
    's_utility_pipes',
  ],
  impossible: [
    's_production_production',
    's_production_coal_extracting',
    's_production_research_station_1',
    's_energy_energy',
    's_energy_renewables',
    's_energy_solar_panel_1',
    's_energy_low_capacity_infrastructure',
    's_utility_utility',
    's_utility_transportation',
    's_utility_truck_depot',
    's_utility_pipes',
  ],
  impossible2: [
    's_production_production',
    's_production_coal_extracting',
    's_production_research_station_1',
    's_energy_energy',
    's_energy_renewables',
    's_energy_solar_panel_1',
    's_energy_low_capacity_infrastructure',
    's_utility_utility',
    's_utility_transportation',
    's_utility_truck_depot',
    's_utility_pipes',
  ],
  sandbox: [],
  sandbox_plus: [],
};

const BLOCKED_SEEDS: Record<GameDifficulty, string[]> = {
  normal: [],
  hard: [
    's_energy_hand_crank',
    's_energy_wind_turbine_1',
    's_energy_geothermal_plant',
    's_energy_solar_panel_2',
  ],
  impossible: [
    's_production_advanced_copper_extraction',
    's_production_advanced_coal_extraction',
    's_energy_hand_crank',
    's_energy_wind_turbine_1',
    's_energy_geothermal_plant',
    's_energy_lv_pole',
    's_energy_energy_storage',
    's_energy_solar_panel_2',
    's_utility_scrubber',
    's_utility_gold_item_storage_silo',
    's_utility_gold_fluid_storage_silo',
  ],
  impossible2: [
    's_production_advanced_copper_extraction',
    's_production_advanced_coal_extraction',
    's_energy_hand_crank',
    's_energy_wind_turbine_1',
    's_energy_geothermal_plant',
    's_energy_lv_pole',
    's_energy_energy_storage',
    's_energy_solar_panel_2',
    's_utility_scrubber',
    's_utility_gold_item_storage_silo',
    's_utility_gold_fluid_storage_silo',
  ],
  sandbox: [],
  sandbox_plus: [],
};

function computeBlockedSet(
  seeds: string[],
  dependentsMap: Map<string, string[]>,
): Set<string> {
  const blocked = new Set<string>();
  for (let i = 0; i < seeds.length; i++) {
    const reachable = collectReachable(seeds[i], dependentsMap);
    reachable.forEach((id) => blocked.add(id));
  }
  return blocked;
}



const elk = new ELK();
let categoryGraphCache: CategoryGraphMap | null = null;
let categoryGraphPromise: Promise<CategoryGraphMap> | null = null;

function formatRpCost(value: number): string {
  return `RP ${value.toLocaleString()}`;
}

function buildPolylinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) {
    return '';
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  return path;
}

function collectReachable(
  startId: string,
  adjacency: Map<string, string[]>,
): Set<string> {
  const visited = new Set<string>();
  const stack = [startId];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const neighbors = adjacency.get(currentId) ?? [];
    for (let i = 0; i < neighbors.length; i++) {
      if (!visited.has(neighbors[i])) {
        stack.push(neighbors[i]);
      }
    }
  }

  return visited;
}

function ResearchGraphNode({ data }: NodeProps<Node<ResearchGraphNodeData>>) {
  const stateClass = data.unlocked ? styles['is-unlocked'] : styles['is-locked'];
  const selectedClass = data.selected ? styles['is-selected'] : '';
  const blockedClass = data.blocked ? styles['is-blocked'] : '';

  return (
    <div className={`${styles['research-node']} ${stateClass} ${selectedClass} ${blockedClass}`.trim()}>
      <Handle
        id={TARGET_HANDLE_ID}
        type="target"
        position={Position.Left}
        className={styles['research-node-handle']}
      />
      <Handle
        id={SOURCE_HANDLE_ID}
        type="source"
        position={Position.Right}
        className={styles['research-node-handle']}
      />
      <div className={styles['research-node-name']}>{data.name}</div>
      <div className={styles['research-node-cost']}>{formatRpCost(data.rpCost)}</div>
    </div>
  );
}

function MachineResearchEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  data,
}: EdgeProps<Edge<ResearchGraphEdgeData>>) {
  const bendPoints = data?.bendPoints ?? [];
  const hasBendPoints = bendPoints.length > 0;

  const path = hasBendPoints
    ? buildPolylinePath([{ x: sourceX, y: sourceY }, ...bendPoints, { x: targetX, y: targetY }])
    : getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition: Position.Right,
      targetX,
      targetY,
      targetPosition: Position.Left,
    })[0];

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      className={styles['machine-edge-path']}
      interactionWidth={8}
    />
  );
}

const nodeTypes: NodeTypes = {
  research: ResearchGraphNode,
};

const edgeTypes: EdgeTypes = {
  researchEdge: MachineResearchEdge,
};

function buildCategoryGraph(category: ResearchCategory): {
  nodes: Node<ResearchGraphNodeData>[];
  edges: Edge<ResearchGraphEdgeData>[];
} {
  const researches = getAllResearches()
    .filter((research) => research.category === category)
    .sort((a, b) => a.name.localeCompare(b.name));

  const researchIds = new Set(researches.map((research) => research.id));

  const nodes: Node<ResearchGraphNodeData>[] = researches.map((research) => ({
    id: research.id,
    type: 'research',
    position: { x: 0, y: 0 },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      name: research.name,
      rpCost: research.rp_cost,
      unlocked: false,
      selected: false,
    },
  }));

  const edges: Edge<ResearchGraphEdgeData>[] = [];
  let edgeCounter = 0;
  for (let i = 0; i < researches.length; i++) {
    const research = researches[i];
    for (let j = 0; j < research.prerequisites.length; j++) {
      const prereqId = research.prerequisites[j];
      if (!researchIds.has(prereqId)) {
        continue;
      }

      edgeCounter += 1;
      edges.push({
        id: `research-edge-${edgeCounter}`,
        source: prereqId,
        target: research.id,
        sourceHandle: SOURCE_HANDLE_ID,
        targetHandle: TARGET_HANDLE_ID,
        type: 'researchEdge',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'var(--theme-color-edge-stroke)',
        },
      });
    }
  }

  return { nodes, edges };
}

function buildFallbackPositions(
  nodes: Node<ResearchGraphNodeData>[],
  edges: Edge<ResearchGraphEdgeData>[],
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) {
    return positions;
  }

  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const nodeNameMap = new Map(nodes.map((node) => [node.id, node.data.name]));
  const levelById = new Map<string, number>();

  for (let i = 0; i < nodes.length; i++) {
    const nodeId = nodes[i].id;
    inDegree.set(nodeId, 0);
    outgoing.set(nodeId, []);
    levelById.set(nodeId, 0);
  }

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!inDegree.has(edge.source) || !inDegree.has(edge.target)) {
      continue;
    }
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    const targets = outgoing.get(edge.source);
    if (targets) {
      targets.push(edge.target);
    }
  }

  const queue = [...inDegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([nodeId]) => nodeId)
    .sort((a, b) => (nodeNameMap.get(a) ?? '').localeCompare(nodeNameMap.get(b) ?? ''));

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) {
      continue;
    }

    const sourceLevel = levelById.get(nodeId) ?? 0;
    const targets = outgoing.get(nodeId) ?? [];
    for (let i = 0; i < targets.length; i++) {
      const targetId = targets[i];
      const nextLevel = sourceLevel + 1;
      if (nextLevel > (levelById.get(targetId) ?? 0)) {
        levelById.set(targetId, nextLevel);
      }

      const remainingInDegree = (inDegree.get(targetId) ?? 0) - 1;
      inDegree.set(targetId, remainingInDegree);
      if (remainingInDegree === 0) {
        queue.push(targetId);
      }
    }
  }

  const levels = new Map<number, string[]>();
  for (let i = 0; i < nodes.length; i++) {
    const nodeId = nodes[i].id;
    const level = levelById.get(nodeId) ?? 0;
    if (!levels.has(level)) {
      levels.set(level, []);
    }
    levels.get(level)?.push(nodeId);
  }

  const orderedLevels = [...levels.entries()].sort((a, b) => a[0] - b[0]);
  for (let levelIndex = 0; levelIndex < orderedLevels.length; levelIndex++) {
    const [level, nodeIds] = orderedLevels[levelIndex];
    nodeIds.sort((a, b) => (nodeNameMap.get(a) ?? '').localeCompare(nodeNameMap.get(b) ?? ''));
    for (let rowIndex = 0; rowIndex < nodeIds.length; rowIndex++) {
      const nodeId = nodeIds[rowIndex];
      positions.set(nodeId, {
        x: FALLBACK_START_X + level * FALLBACK_X_GAP,
        y: FALLBACK_START_Y + rowIndex * FALLBACK_Y_GAP,
      });
    }
  }

  return positions;
}

async function layoutGraph(
  baseNodes: Node<ResearchGraphNodeData>[],
  edges: Edge<ResearchGraphEdgeData>[],
): Promise<{
  nodes: Node<ResearchGraphNodeData>[];
  edges: Edge<ResearchGraphEdgeData>[];
}> {
  if (baseNodes.length === 0) {
    return { nodes: baseNodes, edges };
  }

  const fallbackPositions = buildFallbackPositions(baseNodes, edges);

  try {
    const layouted = await elk.layout({
      id: 'machine-overlay-research-graph',
      properties: {
        algorithm: 'layered',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.nodePlacement.favorStraightEdges': 'true',
        'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
        'elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default': 'NONE',
        'elk.layered.compaction.postCompaction.strategy': 'NONE',
        'elk.layered.spacing.nodeNodeBetweenLayers': '114',
        'elk.spacing.nodeNode': '39',
        'elk.layered.spacing.edgeNodeBetweenLayers': '38',
        'elk.layered.spacing.edgeEdgeBetweenLayers': '19',
        'elk.spacing.edgeNode': '38',
        'elk.layered.feedbackEdges': 'true',
        'elk.padding': '[top=57, left=57, bottom=57, right=57]',
      },
      children: baseNodes.map((node) => ({
        id: node.id,
        width: RESEARCH_NODE_WIDTH,
        height: RESEARCH_NODE_HEIGHT,
        ports: [
          {
            id: `${node.id}:${TARGET_HANDLE_ID}`,
            properties: { 'port.side': 'WEST', 'port.index': '0' },
            x: 0,
            y: RESEARCH_NODE_HEIGHT / 2,
          },
          {
            id: `${node.id}:${SOURCE_HANDLE_ID}`,
            properties: { 'port.side': 'EAST', 'port.index': '0' },
            x: RESEARCH_NODE_WIDTH,
            y: RESEARCH_NODE_HEIGHT / 2,
          },
        ],
        properties: {
          portConstraints: 'FIXED_POS',
          'org.eclipse.elk.portConstraints': 'FIXED_POS',
        },
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        sources: [`${edge.source}:${SOURCE_HANDLE_ID}`],
        targets: [`${edge.target}:${TARGET_HANDLE_ID}`],
      })),
    });

    const elkPositions = new Map<string, { x: number; y: number }>();
    const children = layouted.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (typeof child.x !== 'number' || typeof child.y !== 'number') {
        continue;
      }
      elkPositions.set(child.id, { x: child.x, y: child.y });
    }

    const bendPointsByEdgeId = new Map<string, Array<{ x: number; y: number }>>();
    const layoutedEdges = (
      layouted as unknown as {
        edges?: Array<{
          id: string;
          sections?: Array<{
            bendPoints?: Array<{ x: number; y: number }>;
          }>;
        }>;
      }
    ).edges ?? [];

    for (let i = 0; i < layoutedEdges.length; i++) {
      const edge = layoutedEdges[i];
      if (!edge || !edge.id) {
        continue;
      }

      const firstSection = edge.sections?.[0];
      if (!firstSection?.bendPoints || firstSection.bendPoints.length === 0) {
        continue;
      }

      bendPointsByEdgeId.set(
        edge.id,
        firstSection.bendPoints
          .filter(
            (point: { x: number; y: number }): point is { x: number; y: number } =>
              typeof point.x === 'number' &&
              Number.isFinite(point.x) &&
              typeof point.y === 'number' &&
              Number.isFinite(point.y),
          )
          .map((point: { x: number; y: number }) => ({ x: point.x, y: point.y })),
      );
    }

    return {
      nodes: baseNodes.map((node) => ({
        ...node,
        position: elkPositions.get(node.id) ?? fallbackPositions.get(node.id) ?? { x: 0, y: 0 },
      })),
      edges: edges.map((edge) => ({
        ...edge,
        data: {
          ...(edge.data ?? {}),
          bendPoints: bendPointsByEdgeId.get(edge.id) ?? [],
        },
      })),
    };
  } catch (error) {
    console.error('Research graph layout failed:', error);
    return {
      nodes: baseNodes.map((node) => ({
        ...node,
        position: fallbackPositions.get(node.id) ?? { x: 0, y: 0 },
      })),
      edges,
    };
  }
}

async function buildAllCategoryGraphs(): Promise<CategoryGraphMap> {
  const built = await Promise.all(
    CATEGORY_TABS.map(async (category) => {
      const { nodes, edges } = buildCategoryGraph(category);
      const layouted = await layoutGraph(nodes, edges);
      return [category, layouted] as const;
    }),
  );

  return new Map(built);
}

function ensureCategoryGraphCache(): Promise<CategoryGraphMap> {
  if (categoryGraphCache) {
    return Promise.resolve(categoryGraphCache);
  }
  if (categoryGraphPromise) {
    return categoryGraphPromise;
  }

  categoryGraphPromise = buildAllCategoryGraphs()
    .then((graphMap) => {
      categoryGraphCache = graphMap;
      return graphMap;
    })
    .finally(() => {
      categoryGraphPromise = null;
    });

  return categoryGraphPromise;
}

interface MachineResearchGraphProps {
  category: ResearchCategory;
  selectedResearchId: string | null;
  unlockedResearchIds: Set<string>;
  blockedIds: Set<string>;
  onSelectResearch: (researchId: string) => void;
}

function MachineResearchGraph({
  category,
  selectedResearchId,
  unlockedResearchIds,
  blockedIds,
  onSelectResearch,
}: MachineResearchGraphProps) {
  const [graphMap, setGraphMap] = useState<CategoryGraphMap | null>(() => categoryGraphCache);
  const { fitView } = useReactFlow<Node<ResearchGraphNodeData>, Edge<ResearchGraphEdgeData>>();
  const activeGraph = graphMap?.get(category);
  const baseNodes = activeGraph?.nodes ?? EMPTY_GRAPH_NODES;
  const edges = activeGraph?.edges ?? EMPTY_GRAPH_EDGES;
  const isLayouting = graphMap === null;

  useEffect(() => {
    let isCancelled = false;

    void ensureCategoryGraphCache()
      .then((nextGraphMap) => {
        if (!isCancelled) {
          setGraphMap(nextGraphMap);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('Failed to build machine overlay graph cache:', error);
          setGraphMap(new Map());
        }
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLayouting || baseNodes.length === 0) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      void fitView({
        padding: 0.24,
        duration: 0,
      });
    });
    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [baseNodes, category, fitView, isLayouting]);

  const displayNodes = baseNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      unlocked: unlockedResearchIds.has(node.id),
      selected: selectedResearchId === node.id,
      blocked: blockedIds.has(node.id),
    },
  }));

  if (!isLayouting && displayNodes.length === 0) {
    return <div className={styles['graph-status']}>No researches available for this category.</div>;
  }

  return (
    <div className={styles['graph-canvas']}>
      {isLayouting && <div className={styles['graph-status']}>Building research graph...</div>}
      <ReactFlow<Node<ResearchGraphNodeData>, Edge<ResearchGraphEdgeData>>
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_event, node) => onSelectResearch(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        minZoom={0.2}
        maxZoom={1.6}
        fitView={false}
        onlyRenderVisibleElements={false}
        nodesFocusable={false}
        edgesFocusable={false}
        selectNodesOnDrag={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}

export function MachineOverlay() {
  const isMachineOverlayOpen = useUIStore((state) => state.isMachineOverlayOpen);

  if (!isMachineOverlayOpen) {
    return null;
  }

  return <MachineOverlayModal />;
}

function MachineOverlayModal() {
  const dbVersion = useDataStore((s) => s.dbVersion);

  useEffect(() => {
    categoryGraphCache = null;
  }, [dbVersion]);

  const setMachineOverlayOpen = useUIStore((state) => state.setMachineOverlayOpen);
  const [activeCategory, setActiveCategory] = useState<ResearchCategory>('Production');
  const [selectedResearchId, setSelectedResearchId] = useState<string | null>(null);
  const difficulty = useGlobalSettingsStore((s) => s.settings.difficulty) as GameDifficulty;
  const oreNodesEnabled = useGlobalSettingsStore((s) => s.settings.oreNodesEnabled);
  const showVariantLimited = useGlobalSettingsStore((s) => s.settings.showVariantLimited);
  const unlockedResearchIdsArray = useGlobalSettingsStore((s) => s.settings.unlockedResearchIds);
  const unlockedResearchIds = new Set(unlockedResearchIdsArray);

  const setDifficultyInStore = useGlobalSettingsStore((s) => s.setDifficulty);
  const setUnlockedResearchIdsInStore = useGlobalSettingsStore((s) => s.setUnlockedResearchIds);
  const setOreNodesEnabledInStore = useGlobalSettingsStore((s) => s.setOreNodesEnabled);
  const setShowVariantLimitedInStore = useGlobalSettingsStore((s) => s.setShowVariantLimited);

  const researches = getAllResearches();
  const machines = getAllMachines();

  const researchesById = new Map<string, (typeof researches)[number]>();
  for (let i = 0; i < researches.length; i++) {
    researchesById.set(researches[i].id, researches[i]);
  }

  const prerequisitesById = new Map<string, string[]>();
  for (let i = 0; i < researches.length; i++) {
    const research = researches[i];
    const validPrerequisites: string[] = [];
    for (let j = 0; j < research.prerequisites.length; j++) {
      const prerequisiteId = research.prerequisites[j];
      if (researchesById.has(prerequisiteId)) {
        validPrerequisites.push(prerequisiteId);
      }
    }
    prerequisitesById.set(research.id, validPrerequisites);
  }

  const dependentsById = new Map<string, string[]>();
  for (let i = 0; i < researches.length; i++) {
    dependentsById.set(researches[i].id, []);
  }
  for (let i = 0; i < researches.length; i++) {
    const research = researches[i];
    const prerequisites = prerequisitesById.get(research.id) ?? [];
    for (let j = 0; j < prerequisites.length; j++) {
      const prerequisiteId = prerequisites[j];
      const dependents = dependentsById.get(prerequisiteId);
      if (dependents) {
        dependents.push(research.id);
      }
    }
  }

  const selectedResearch = selectedResearchId ? researchesById.get(selectedResearchId) ?? null : null;

  const isSandboxMode = difficulty === 'sandbox' || difficulty === 'sandbox_plus';
  const isSandboxPlus = difficulty === 'sandbox_plus';

  const unlockedMachines = selectedResearch
    ? machines
      .filter((machine) => {
        if (machine.sandboxPlusOnly && !isSandboxPlus) {
          return false;
        }
        if (machine.sandboxOnly && !isSandboxMode) {
          return false;
        }
        if (machine.research === selectedResearch.id) {
          return true;
        }
        if (machine.variant && machine.variant !== 'none' && machine.variant !== '') {
          let current = getMachine(machine.variant);
          while (current) {
            if (current.research === selectedResearch.id) {
              return true;
            }
            current = (current.variant && current.variant !== 'none' && current.variant !== '')
              ? getMachine(current.variant)
              : undefined;
          }
        }
        return false;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const isSandbox = difficulty === 'sandbox' || difficulty === 'sandbox_plus';
  const alwaysUnlockedIds = new Set(ALWAYS_UNLOCKED_SEEDS[difficulty]);
  const blockedIds = computeBlockedSet(BLOCKED_SEEDS[difficulty], dependentsById);

  const isSelectedAlwaysUnlocked = selectedResearch
    ? alwaysUnlockedIds.has(selectedResearch.id)
    : false;
  const isSelectedBlocked = selectedResearch ? blockedIds.has(selectedResearch.id) : false;
  const canToggleSelected = !isSandbox && !isSelectedAlwaysUnlocked && !isSelectedBlocked;

  const handleDifficultyChange = (newDifficulty: GameDifficulty) => {
    setDifficultyInStore(newDifficulty);
    useDashboardStore.getState().recompute();
  };

  const handleOreNodesChange = (enabled: boolean) => {
    if (difficulty === 'impossible2') return;
    setOreNodesEnabledInStore(enabled);
  };

  const handleShowVariantLimitedChange = (enabled: boolean) => {
    setShowVariantLimitedInStore(enabled);
  };

  const handleUnlock = () => {
    if (!selectedResearch || !canToggleSelected) {
      return;
    }

    const prerequisiteChain = collectReachable(selectedResearch.id, prerequisitesById);
    const nextList: string[] = [];
    unlockedResearchIds.forEach((id) => nextList.push(id));
    prerequisiteChain.forEach((researchId) => {
      if (!blockedIds.has(researchId) && !nextList.includes(researchId)) {
        nextList.push(researchId);
      }
    });
    setUnlockedResearchIdsInStore(nextList);
  };

  const handleLock = () => {
    if (!selectedResearch || !canToggleSelected) {
      return;
    }

    const dependentChain = collectReachable(selectedResearch.id, dependentsById);
    const nextList: string[] = [];
    unlockedResearchIds.forEach((id) => {
      if (!dependentChain.has(id) || alwaysUnlockedIds.has(id)) {
        nextList.push(id);
      }
    });
    setUnlockedResearchIdsInStore(nextList);
  };

  return createPortal(
    <div className={styles['machine-overlay']} onClick={() => setMachineOverlayOpen(false)}>
      <div className={styles['machine-modal']} onClick={(event) => event.stopPropagation()}>
        <div className={styles['machine-header']}>
          <div className={styles['machine-title']}>
            <Settings size={18} />
            <span>Machine Overlay</span>
          </div>
          <button
            className={styles['machine-close']}
            onClick={() => setMachineOverlayOpen(false)}
            aria-label="Close machine overlay"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles['machine-tabs']}>
          {CATEGORY_TABS.map((category) => (
            <button
              key={category}
              className={`${styles['machine-tab']} ${activeCategory === category ? styles['is-active'] : ''
                }`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <div className={styles['machine-content']}>
          <aside className={styles['machine-sidebar']}>
            <div className={styles['sidebar-section']}>
              <div className={styles['sidebar-section-title']}>Options</div>

              <label className={styles['option-row']}>
                <span className={styles['option-label']}>Difficulty</span>
                <select
                  className={styles['option-select']}
                  value={difficulty}
                  onChange={(e) =>
                    handleDifficultyChange(e.target.value as GameDifficulty)
                  }
                >
                  {DIFFICULTY_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles['option-checkbox-row']}>
                <input
                  type="checkbox"
                  className={styles['option-checkbox']}
                  checked={oreNodesEnabled}
                  disabled={difficulty === 'impossible2'}
                  onChange={(e) => handleOreNodesChange(e.target.checked)}
                />
                <span className={styles['option-label']}>Ore Nodes</span>
              </label>

              <label className={styles['option-checkbox-row']}>
                <input
                  type="checkbox"
                  className={styles['option-checkbox']}
                  checked={showVariantLimited}
                  onChange={(e) => handleShowVariantLimitedChange(e.target.checked)}
                />
                <span className={styles['option-label']}>Variant & Limited Machines</span>
              </label>
            </div>

            <div className={styles['sidebar-divider']} />

            {selectedResearch ? (
              <>
                <div className={styles['sidebar-title']}>{selectedResearch.name}</div>
                <div className={styles['sidebar-meta']}>
                  <span>{selectedResearch.category}</span>
                  <span>{formatRpCost(selectedResearch.rp_cost)}</span>
                </div>

                {!isSandbox && (
                  <div className={styles['sidebar-actions']}>
                    <button
                      className={styles['btn-unlock']}
                      onClick={handleUnlock}
                      disabled={!canToggleSelected}
                    >
                      <Unlock size={14} />
                      <span>Unlock Chain</span>
                    </button>
                    <button
                      className={styles['btn-lock']}
                      onClick={handleLock}
                      disabled={!canToggleSelected}
                    >
                      <Lock size={14} />
                      <span>Lock Chain</span>
                    </button>
                  </div>
                )}

                <div className={styles['sidebar-section']}>
                  <div className={styles['sidebar-section-title']}>
                    Prerequisites ({selectedResearch.prerequisites.length})
                  </div>
                  {selectedResearch.prerequisites.length === 0 ? (
                    <div className={styles['sidebar-empty']}>None</div>
                  ) : (
                    <div className={styles['machine-list']}>
                      {selectedResearch.prerequisites.map((prereqId) => {
                        const prereqResearch = researchesById.get(prereqId);
                        const isUnlocked = unlockedResearchIds.has(prereqId);
                        return (
                          <div key={prereqId} className={styles['machine-item']}>
                            <div className={styles['machine-item-name']}>
                              {prereqResearch ? prereqResearch.name : prereqId}
                            </div>
                            <div className={styles['machine-item-meta']}>
                              {prereqResearch ? (isUnlocked ? 'Unlocked' : 'Locked') : 'Required'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={styles['sidebar-section']}>
                  <div className={styles['sidebar-section-title']}>
                    Unlocks Machines ({unlockedMachines.length})
                  </div>
                  {unlockedMachines.length === 0 ? (
                    <div className={styles['sidebar-empty']}>No machine requires this research.</div>
                  ) : (
                    <div className={styles['machine-list']}>
                      {unlockedMachines.map((machine) => (
                        <div key={machine.id} className={styles['machine-item']}>
                          <div className={styles['machine-item-name']}>{machine.name}</div>
                          <div className={styles['machine-item-meta']}>
                            Tier {machine.tier} - {machine.category}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={styles['sidebar-empty-full']}>
                Click any research node to view unlock details and control lock state.
              </div>
            )}
          </aside>

          <div className={styles['machine-graph-pane']}>
            <ReactFlowProvider>
              <MachineResearchGraph
                key={`${activeCategory}-${dbVersion}`}
                category={activeCategory}
                selectedResearchId={selectedResearchId}
                unlockedResearchIds={unlockedResearchIds}
                blockedIds={blockedIds}
                onSelectResearch={setSelectedResearchId}
              />
            </ReactFlowProvider>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
