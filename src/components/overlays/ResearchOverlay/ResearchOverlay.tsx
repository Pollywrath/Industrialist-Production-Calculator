import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
import { FlaskConical, Lock, Settings, Unlock, X } from 'lucide-react';
import { getAllMachines, getAllResearches, getMachine } from '../../../data/lookup';
import { useUIStore } from '../../../stores/useUIStore';
import { useGlobalSettingsStore } from '../../../stores/useGlobalSettingsStore';
import { useDashboardStore } from '../../../stores/useDashboardStore';
import { useDataStore } from '../../../stores/useDataStore';
import { ValidatedNumberInput } from '../../shared/ValidatedNumberInput';
import {
  calculateResearchOutput,
  type ResearchInfrastructureStats,
} from '../../../utils/researchInfrastructure';
import { getRateSuffix } from '../../../utils/rateFormatting';
import { formatLongTime, formatQuantity } from '../../../utils/unitFormatting';
import styles from './ResearchOverlay.module.css';

type ResearchCategory = 'Production' | 'Energy' | 'Utility';
type ResearchOverlayTab = ResearchCategory | 'RP Calculator';

interface ResearchGraphNodeData extends Record<string, unknown> {
  name: string;
  rpCost: number;
  unlocked: boolean;
  selected: boolean;
  targetSelected: boolean;
}

interface ResearchGraphEdgeData extends Record<string, unknown> {
  bendPoints?: Array<{ x: number; y: number }>;
}

type CategoryGraphMap = Map<
  ResearchCategory,
  { nodes: Node<ResearchGraphNodeData>[]; edges: Edge<ResearchGraphEdgeData>[] }
>;

const CATEGORY_TABS: ResearchCategory[] = ['Production', 'Energy', 'Utility'];
const OVERLAY_TABS: ResearchOverlayTab[] = ['RP Calculator', ...CATEGORY_TABS];
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

function computeBlockedSet(seeds: string[], dependentsMap: Map<string, string[]>): Set<string> {
  const blocked = new Set<string>();
  for (let i = 0; i < seeds.length; i++) {
    const reachable = collectReachable(seeds[i], dependentsMap);
    reachable.forEach((id) => blocked.add(id));
  }
  return blocked;
}

const elk = new ELK();
let categoryGraphCache: { dbVersion: number; graphs: CategoryGraphMap } | null = null;
let categoryGraphPromise: {
  dbVersion: number;
  promise: Promise<CategoryGraphMap>;
} | null = null;
let categoryGraphRequestId = 0;

function formatRpCost(value: number): string {
  return `RP ${value.toLocaleString()}`;
}

function formatResearchNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
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

function collectReachable(startId: string, adjacency: Map<string, string[]>): Set<string> {
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

function collectResearchUnlockChain(
  targetId: string,
  prerequisitesById: Map<string, string[]>,
  unlockedIds: Set<string>,
  alwaysUnlockedIds: Set<string>,
  blockedIds: Set<string>,
): string[] {
  const chain: string[] = [];
  const visited = new Set<string>();

  const visit = (researchId: string) => {
    if (
      visited.has(researchId) ||
      unlockedIds.has(researchId) ||
      alwaysUnlockedIds.has(researchId) ||
      blockedIds.has(researchId)
    ) {
      return;
    }

    visited.add(researchId);
    const prerequisites = prerequisitesById.get(researchId) ?? [];
    for (let i = 0; i < prerequisites.length; i++) {
      visit(prerequisites[i]);
    }
    chain.push(researchId);
  };

  visit(targetId);
  return chain;
}

interface ResearchProjectionPoint {
  elapsedSeconds: number;
  researchPoints: number;
}

interface ResearchProjectionStep {
  researchId: string;
  name: string;
  startSeconds: number;
  endSeconds: number;
}

interface ResearchProjection {
  points: ResearchProjectionPoint[];
  researchSteps: ResearchProjectionStep[];
  elapsedSeconds: number | null;
  reachedTarget: boolean;
  failureReason: 'no-rate' | 'precision-limit' | null;
}

interface ResearchTimeInterval {
  startResearchPoints: number;
  endResearchPoints: number;
  elapsedSeconds: number;
  errorEstimate: number;
  logRateChange: number;
}

interface ResearchTimeIntegral {
  intervals: ResearchTimeInterval[];
  failureReason: 'no-rate' | 'precision-limit' | null;
}

const GAUSS_KRONROD_15_ABSCISSAS = [
  0.9914553711208126,
  0.9491079123427585,
  0.8648644233597691,
  0.7415311855993945,
  0.5860872354676911,
  0.4058451513773972,
  0.2077849550078985,
  0,
] as const;
const GAUSS_KRONROD_15_WEIGHTS = [
  0.02293532201052922,
  0.06309209262997854,
  0.1047900103222502,
  0.1406532597155259,
  0.1690047266392679,
  0.1903505780647854,
  0.2044329400752989,
  0.2094821410847278,
] as const;
const GAUSS_7_WEIGHTS = [
  0.1294849661688697,
  0.2797053914892767,
  0.3818300505051189,
  0.4179591836734694,
] as const;

interface ResearchGraphInspection {
  x: number;
  y: number;
  elapsedSeconds: number;
  researchPoints: number;
  rpPerSecond: number;
  researchName: string | null;
  projectionKey: string;
}

function calculateResearchProjection(
  infrastructure: ResearchInfrastructureStats,
  initialResearchPoints: number,
  projectionMode: 'target' | 'chain',
  targetResearchPoints: number | undefined,
  chainResearch: Array<{ id: string; name: string; rpCost: number }>,
): ResearchProjection | null {
  if (projectionMode === 'target' && targetResearchPoints === undefined) return null;
  if (projectionMode === 'chain' && chainResearch.length === 0) return null;

  const points: ResearchProjectionPoint[] = [];
  const researchSteps: ResearchProjectionStep[] = [];
  let currentRp = Math.max(0, initialResearchPoints);
  let elapsedSeconds = 0;
  points.push({ elapsedSeconds, researchPoints: currentRp });

  const researchRatePerPoint = (researchPoints: number): number | null => {
    const rpPerSecond = calculateResearchOutput(infrastructure, researchPoints).currentRpPerSecond;
    return Number.isFinite(rpPerSecond) && rpPerSecond > 0 ? rpPerSecond : null;
  };

  const evaluateResearchTimeInterval = (
    startResearchPoints: number,
    endResearchPoints: number,
  ): ResearchTimeInterval | null => {
    const center = (startResearchPoints + endResearchPoints) / 2;
    const halfWidth = (endResearchPoints - startResearchPoints) / 2;
    const researchTimePerPoint = (researchPoints: number): number | null => {
      const rpPerSecond = researchRatePerPoint(researchPoints);
      if (rpPerSecond === null) return null;
      const value = 1 / rpPerSecond;
      return Number.isFinite(value) && value > 0 ? value : null;
    };

    const centerValue = researchTimePerPoint(center);
    if (centerValue === null) return null;

    let kronrodSum = GAUSS_KRONROD_15_WEIGHTS[7] * centerValue;
    let gaussSum = GAUSS_7_WEIGHTS[3] * centerValue;
    const samples: Array<{ weight: number; value: number }> = [
      { weight: GAUSS_KRONROD_15_WEIGHTS[7], value: centerValue },
    ];

    for (let i = 0; i < 7; i++) {
      const offset = halfWidth * GAUSS_KRONROD_15_ABSCISSAS[i];
      const leftValue = researchTimePerPoint(center - offset);
      const rightValue = researchTimePerPoint(center + offset);
      if (leftValue === null || rightValue === null) return null;

      const pairSum = leftValue + rightValue;
      kronrodSum += GAUSS_KRONROD_15_WEIGHTS[i] * pairSum;
      samples.push(
        { weight: GAUSS_KRONROD_15_WEIGHTS[i], value: leftValue },
        { weight: GAUSS_KRONROD_15_WEIGHTS[i], value: rightValue },
      );
      if (i === 1) gaussSum += GAUSS_7_WEIGHTS[0] * pairSum;
      if (i === 3) gaussSum += GAUSS_7_WEIGHTS[1] * pairSum;
      if (i === 5) gaussSum += GAUSS_7_WEIGHTS[2] * pairSum;
    }

    const elapsedSeconds = kronrodSum * halfWidth;
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return null;
    const meanValue = kronrodSum / 2;
    const absoluteSum = samples.reduce(
      (sum, sample) => sum + sample.weight * Math.abs(sample.value),
      0,
    );
    const absoluteDeviationSum = samples.reduce(
      (sum, sample) => sum + sample.weight * Math.abs(sample.value - meanValue),
      0,
    );
    const rawError = Math.abs((kronrodSum - gaussSum) * halfWidth);
    const absoluteDeviation = absoluteDeviationSum * halfWidth;
    const scaledError =
      absoluteDeviation > 0 && rawError > 0
        ? absoluteDeviation * Math.min(1, Math.pow((200 * rawError) / absoluteDeviation, 1.5))
        : rawError;
    const estimatedError = Math.max(
      scaledError,
      50 * Number.EPSILON * absoluteSum * halfWidth,
    );
    const width = endResearchPoints - startResearchPoints;
    const endpointInset = Math.min(
      width / 4,
      Math.max(
        width * 1e-6,
        Number.EPSILON * Math.max(Math.abs(startResearchPoints), Math.abs(endResearchPoints)) * 4,
      ),
    );
    const startRate = researchRatePerPoint(startResearchPoints + endpointInset);
    const endRate = researchRatePerPoint(endResearchPoints - endpointInset);
    if (startRate === null || endRate === null) return null;

    return {
      startResearchPoints,
      endResearchPoints,
      elapsedSeconds,
      errorEstimate: estimatedError,
      logRateChange: Math.abs(Math.log(startRate) - Math.log(endRate)),
    };
  };

  const integrateResearchTime = (
    startResearchPoints: number,
    endResearchPoints: number,
  ): ResearchTimeIntegral => {
    if (endResearchPoints <= startResearchPoints) {
      return { intervals: [], failureReason: null };
    }

    const outputAtStart = calculateResearchOutput(infrastructure, startResearchPoints);
    const breakpoints = [
      startResearchPoints,
      endResearchPoints,
      outputAtStart.researchStation1.rpCap,
      outputAtStart.researchStation2.rpCap,
      outputAtStart.researchStation3.rpCap,
      outputAtStart.researchStation4.rpCap,
    ]
      .filter(
        (researchPoints) =>
          researchPoints >= startResearchPoints && researchPoints <= endResearchPoints,
      )
      .sort((left, right) => left - right)
      .filter((researchPoints, index, sorted) => index === 0 || researchPoints !== sorted[index - 1]);

    const intervals: ResearchTimeInterval[] = [];
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const interval = evaluateResearchTimeInterval(breakpoints[i], breakpoints[i + 1]);
      if (!interval) return { intervals: [], failureReason: 'no-rate' };
      intervals.push(interval);
    }

    const relativeTolerance = 1e-6;
    const absoluteToleranceSeconds = 1e-8;
    const maximumLogRateChange = Math.LN2;
    const maximumIntervals = 1024;
    let elapsedSeconds = intervals.reduce((total, interval) => total + interval.elapsedSeconds, 0);
    let errorEstimate = intervals.reduce((total, interval) => total + interval.errorEstimate, 0);

    while (
      errorEstimate > Math.max(absoluteToleranceSeconds, elapsedSeconds * relativeTolerance) ||
      intervals.some((interval) => interval.logRateChange > maximumLogRateChange)
    ) {
      if (intervals.length >= maximumIntervals) {
        return { intervals, failureReason: 'precision-limit' };
      }

      let largestErrorIndex = 0;
      const hasAccuracyExcess =
        errorEstimate > Math.max(absoluteToleranceSeconds, elapsedSeconds * relativeTolerance);
      for (let i = 1; i < intervals.length; i++) {
        const currentScore = hasAccuracyExcess
          ? intervals[i].errorEstimate
          : intervals[i].logRateChange;
        const largestScore = hasAccuracyExcess
          ? intervals[largestErrorIndex].errorEstimate
          : intervals[largestErrorIndex].logRateChange;
        if (currentScore > largestScore) {
          largestErrorIndex = i;
        }
      }
      if (
        !hasAccuracyExcess &&
        intervals[largestErrorIndex].logRateChange <= maximumLogRateChange
      ) {
        largestErrorIndex = intervals.findIndex(
          (interval) => interval.logRateChange > maximumLogRateChange,
        );
      }

      const interval = intervals[largestErrorIndex];
      const midpoint = (interval.startResearchPoints + interval.endResearchPoints) / 2;
      if (
        midpoint <= interval.startResearchPoints ||
        midpoint >= interval.endResearchPoints
      ) {
        return { intervals, failureReason: 'precision-limit' };
      }

      const leftInterval = evaluateResearchTimeInterval(interval.startResearchPoints, midpoint);
      const rightInterval = evaluateResearchTimeInterval(midpoint, interval.endResearchPoints);
      if (!leftInterval || !rightInterval) {
        return { intervals, failureReason: 'precision-limit' };
      }

      elapsedSeconds +=
        leftInterval.elapsedSeconds + rightInterval.elapsedSeconds - interval.elapsedSeconds;
      errorEstimate = Math.max(
        0,
        errorEstimate +
          leftInterval.errorEstimate +
          rightInterval.errorEstimate -
          interval.errorEstimate,
      );
      intervals.splice(largestErrorIndex, 1, leftInterval, rightInterval);
    }

    intervals.sort((left, right) => left.startResearchPoints - right.startResearchPoints);
    return { intervals, failureReason: null };
  };

  let precisionLimitHit = false;
  const advanceToRp = (targetRp: number): 'no-rate' | null => {
    if (targetRp <= currentRp) return null;

    const integral = integrateResearchTime(currentRp, targetRp);
    if (integral.failureReason === 'no-rate') return 'no-rate';
    if (integral.failureReason === 'precision-limit') precisionLimitHit = true;

    for (const interval of integral.intervals) {
      elapsedSeconds += interval.elapsedSeconds;
      if (!Number.isFinite(elapsedSeconds)) return 'no-rate';
      points.push({ elapsedSeconds, researchPoints: interval.endResearchPoints });
    }

    currentRp = targetRp;
    return null;
  };

  if (projectionMode === 'target') {
    const targetRp = Math.max(0, targetResearchPoints ?? 0);
    const failureReason = advanceToRp(targetRp);
    const reachedTarget = failureReason !== 'no-rate';
    return {
      points,
      researchSteps,
      elapsedSeconds: reachedTarget ? elapsedSeconds : null,
      reachedTarget,
      failureReason: failureReason ?? (precisionLimitHit ? 'precision-limit' : null),
    };
  }

  for (let i = 0; i < chainResearch.length; i++) {
    const research = chainResearch[i];
    const researchCost = Math.max(0, research.rpCost);
    const startSeconds = elapsedSeconds;
    const failureReason = advanceToRp(researchCost);
    if (failureReason === 'no-rate') {
      researchSteps.push({
        researchId: research.id,
        name: research.name,
        startSeconds,
        endSeconds: elapsedSeconds,
      });
      return {
        points,
        researchSteps,
        elapsedSeconds: null,
        reachedTarget: false,
        failureReason,
      };
    }
    researchSteps.push({
      researchId: research.id,
      name: research.name,
      startSeconds,
      endSeconds: elapsedSeconds,
    });
    if (i < chainResearch.length - 1) {
      currentRp = Math.max(0, currentRp - researchCost);
      points.push({ elapsedSeconds, researchPoints: currentRp });
    }
  }

  return {
    points,
    researchSteps,
    elapsedSeconds,
    reachedTarget: true,
    failureReason: precisionLimitHit ? 'precision-limit' : null,
  };
}

function interpolateResearchPoints(points: ResearchProjectionPoint[], elapsedSeconds: number): number {
  if (points.length === 0) return 0;
  let nextIndex = 0;
  while (nextIndex < points.length && points[nextIndex].elapsedSeconds <= elapsedSeconds) {
    nextIndex++;
  }

  const previous = points[Math.max(0, nextIndex - 1)];
  const next = points[nextIndex];
  if (!next || next.elapsedSeconds <= previous.elapsedSeconds) return previous.researchPoints;

  const fraction = (elapsedSeconds - previous.elapsedSeconds) /
    (next.elapsedSeconds - previous.elapsedSeconds);
  return previous.researchPoints + (next.researchPoints - previous.researchPoints) * fraction;
}

function getProjectionSvgX(svg: SVGSVGElement, clientX: number, clientY: number): number | null {
  const transform = svg.getScreenCTM();
  if (!transform) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(transform.inverse()).x;
}

function ResearchGraphNode({ data }: NodeProps<Node<ResearchGraphNodeData>>) {
  const stateClass = data.unlocked ? styles['is-unlocked'] : styles['is-locked'];
  const selectedClass = data.selected ? styles['is-selected'] : '';
  const targetSelectedClass = data.targetSelected ? styles['is-target-selected'] : '';
  const blockedClass = data.blocked ? styles['is-blocked'] : '';

  return (
    <div
      className={`${styles['research-node']} ${stateClass} ${selectedClass} ${targetSelectedClass} ${blockedClass}`.trim()}
    >
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
      className={styles['research-edge-path']}
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
      targetSelected: false,
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
      id: 'research-overlay-graph',
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
    const layoutedEdges =
      (
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

function ensureCategoryGraphCache(dbVersion: number): Promise<CategoryGraphMap> {
  if (categoryGraphCache?.dbVersion === dbVersion) {
    return Promise.resolve(categoryGraphCache.graphs);
  }
  if (categoryGraphPromise?.dbVersion === dbVersion) {
    return categoryGraphPromise.promise;
  }

  const requestId = ++categoryGraphRequestId;
  const promise = buildAllCategoryGraphs()
    .then((graphMap) => {
      if (categoryGraphRequestId === requestId) {
        categoryGraphCache = { dbVersion, graphs: graphMap };
      }
      return graphMap;
    })
    .finally(() => {
      if (categoryGraphRequestId === requestId) {
        categoryGraphPromise = null;
      }
    });
  categoryGraphPromise = { dbVersion, promise };

  return promise;
}

interface MachineResearchGraphProps {
  category: ResearchCategory;
  dbVersion: number;
  selectedResearchId: string | null;
  targetResearchIds: Set<string>;
  isSelectingTargets: boolean;
  unlockedResearchIds: Set<string>;
  blockedIds: Set<string>;
  onSelectResearch: (researchId: string) => void;
  onToggleTargetResearch: (researchId: string) => void;
}

function MachineResearchGraph({
  category,
  dbVersion,
  selectedResearchId,
  targetResearchIds,
  isSelectingTargets,
  unlockedResearchIds,
  blockedIds,
  onSelectResearch,
  onToggleTargetResearch,
}: MachineResearchGraphProps) {
  const [graphMap, setGraphMap] = useState<CategoryGraphMap | null>(() =>
    categoryGraphCache?.dbVersion === dbVersion ? categoryGraphCache.graphs : null,
  );
  const { fitView } = useReactFlow<Node<ResearchGraphNodeData>, Edge<ResearchGraphEdgeData>>();
  const activeGraph = graphMap?.get(category);
  const baseNodes = activeGraph?.nodes ?? EMPTY_GRAPH_NODES;
  const edges = activeGraph?.edges ?? EMPTY_GRAPH_EDGES;
  const isLayouting = graphMap === null;

  useEffect(() => {
    let isCancelled = false;

    void ensureCategoryGraphCache(dbVersion)
      .then((nextGraphMap) => {
        if (!isCancelled) {
          setGraphMap(nextGraphMap);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          console.error('Failed to build research overlay graph cache:', error);
          setGraphMap(new Map());
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [dbVersion]);

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
      targetSelected: targetResearchIds.has(node.id),
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
        onNodeClick={(_event, node) =>
          isSelectingTargets ? onToggleTargetResearch(node.id) : onSelectResearch(node.id)
        }
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

export function ResearchOverlay() {
  const isResearchOverlayOpen = useUIStore((state) => state.isResearchOverlayOpen);

  if (!isResearchOverlayOpen) {
    return null;
  }

  return <ResearchOverlayModal />;
}

function ResearchOverlayModal() {
  const rpRateSuffix = getRateSuffix('second');
  const dbVersion = useDataStore((s) => s.dbVersion);
  const researchInfrastructure = useDashboardStore((s) => s.researchInfrastructure);
  const currentResearchPoints = useUIStore((s) => s.currentResearchPoints);
  const setCurrentResearchPoints = useUIStore((s) => s.setCurrentResearchPoints);
  const targetResearchPoints = useUIStore((s) => s.targetResearchPoints);
  const setTargetResearchPoints = useUIStore((s) => s.setTargetResearchPoints);
  const researchTargetIds = useUIStore((s) => s.researchTargetIds);
  const setResearchTargetIds = useUIStore((s) => s.setResearchTargetIds);
  const researchProjectionMode = useUIStore((s) => s.researchProjectionMode);
  const setResearchProjectionMode = useUIStore((s) => s.setResearchProjectionMode);
  const researchOutput = calculateResearchOutput(
    researchInfrastructure,
    currentResearchPoints,
  );

  const setResearchOverlayOpen = useUIStore((state) => state.setResearchOverlayOpen);
  const [activeTab, setActiveTab] = useState<ResearchOverlayTab>('RP Calculator');
  const [selectedResearchId, setSelectedResearchId] = useState<string | null>(null);
  const [isSelectingTargetResearches, setIsSelectingTargetResearches] = useState(false);
  const [draftTargetResearchIds, setDraftTargetResearchIds] = useState<string[]>([]);
  const [projectionTimeWindow, setProjectionTimeWindow] = useState<{
    start: number;
    end: number;
    projectionKey: string;
  } | null>(null);
  const [inspectedProjection, setInspectedProjection] = useState<ResearchGraphInspection | null>(null);
  const [isProjectionPanning, setIsProjectionPanning] = useState(false);
  const projectionDragRef = useRef<{
    svgX: number;
    start: number;
    end: number;
    moved: boolean;
  } | null>(null);
  const projectionChartRef = useRef<SVGSVGElement | null>(null);
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

  const selectedResearch = selectedResearchId
    ? (researchesById.get(selectedResearchId) ?? null)
    : null;

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
              current =
                current.variant && current.variant !== 'none' && current.variant !== ''
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
  const pendingResearchIds = new Set<string>();
  researchTargetIds.forEach((targetId) => {
    collectResearchUnlockChain(
      targetId,
      prerequisitesById,
      unlockedResearchIds,
      alwaysUnlockedIds,
      blockedIds,
    ).forEach((researchId) => {
      pendingResearchIds.add(researchId);
    });
  });

  const researchUnlockChain: string[] = [];
  while (pendingResearchIds.size > 0) {
    let cheapestAvailableResearchId: string | null = null;
    let cheapestAvailableCost = Infinity;

    for (const researchId of pendingResearchIds) {
      const prerequisites = prerequisitesById.get(researchId) ?? [];
      if (prerequisites.some((prerequisiteId) => pendingResearchIds.has(prerequisiteId))) {
        continue;
      }

      const research = researchesById.get(researchId);
      if (!research) continue;
      const cost = Math.max(0, research.rp_cost);
      if (
        cost < cheapestAvailableCost ||
        (cost === cheapestAvailableCost &&
          (cheapestAvailableResearchId === null ||
            researchId.localeCompare(cheapestAvailableResearchId) < 0))
      ) {
        cheapestAvailableResearchId = researchId;
        cheapestAvailableCost = cost;
      }
    }

    if (cheapestAvailableResearchId === null) {
      const remainingResearchIds = [...pendingResearchIds].sort((leftId, rightId) => {
        const leftCost = Math.max(0, researchesById.get(leftId)?.rp_cost ?? 0);
        const rightCost = Math.max(0, researchesById.get(rightId)?.rp_cost ?? 0);
        return leftCost - rightCost || leftId.localeCompare(rightId);
      });
      researchUnlockChain.push(...remainingResearchIds);
      break;
    }

    researchUnlockChain.push(cheapestAvailableResearchId);
    pendingResearchIds.delete(cheapestAvailableResearchId);
  }

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

  const handleStartTargetResearchSelection = () => {
    if (isSandbox) return;
    setDraftTargetResearchIds(researchTargetIds);
    setIsSelectingTargetResearches(true);
    setActiveTab('Production');
  };

  const handleFinishTargetResearchSelection = () => {
    setResearchTargetIds(draftTargetResearchIds);
    setTargetResearchPoints(undefined);
    setResearchProjectionMode('chain');
    setIsSelectingTargetResearches(false);
  };

  const handleTargetResearchNodeClick = (researchId: string) => {
    setDraftTargetResearchIds((current) => {
      if (current.includes(researchId)) {
        return current.filter((id) => id !== researchId);
      }
      if (
        unlockedResearchIds.has(researchId) ||
        alwaysUnlockedIds.has(researchId) ||
        blockedIds.has(researchId)
      ) {
        return current;
      }
      return [...current, researchId];
    });
  };

  const handleCloseResearchOverlay = () => {
    if (isSelectingTargetResearches) {
      handleFinishTargetResearchSelection();
    }
    setResearchOverlayOpen(false);
  };

  const handleTargetResearchPointsChange = (value: number) => {
    setTargetResearchPoints(value);
    setResearchProjectionMode('target');
  };

  const handleClearTargetResearchPoints = () => {
    setTargetResearchPoints(undefined);
    setResearchProjectionMode('target');
  };

  const chainResearch = researchUnlockChain
    .map((researchId) => researchesById.get(researchId))
    .filter((research): research is NonNullable<typeof research> => Boolean(research))
    .map((research) => ({ id: research.id, name: research.name, rpCost: research.rp_cost }));
  const researchProjection = isSelectingTargetResearches
    ? null
    : calculateResearchProjection(
        researchInfrastructure,
        currentResearchPoints,
        researchProjectionMode,
        targetResearchPoints,
        chainResearch,
      );
  const activeTargetResearchIds = isSelectingTargetResearches
    ? new Set(draftTargetResearchIds)
    : new Set(researchTargetIds);
  const activeTargetResearchCount = [...activeTargetResearchIds].filter((researchId) =>
    researchesById.has(researchId),
  ).length;
  const projectionPoints = researchProjection?.points ?? [];
  const projectionPlot = { left: 82, right: 920, top: 22, bottom: 254 };
  const researchTargetIdsKey = researchTargetIds.join('|');
  const projectionStateKey = JSON.stringify([
    dbVersion,
    currentResearchPoints,
    researchInfrastructure,
    researchProjectionMode,
    researchTargetIdsKey,
    targetResearchPoints,
  ]);
  const activeProjectionTimeWindow =
    projectionTimeWindow?.projectionKey === projectionStateKey ? projectionTimeWindow : null;
  const activeInspectedProjection =
    inspectedProjection?.projectionKey === projectionStateKey ? inspectedProjection : null;
  const projectionFullTime = Math.max(
    projectionPoints[projectionPoints.length - 1]?.elapsedSeconds ?? 0,
    1,
  );
  const requestedProjectionStart = activeProjectionTimeWindow?.start ?? 0;
  const requestedProjectionEnd = activeProjectionTimeWindow?.end ?? projectionFullTime;
  const projectionWindowSpan = Math.max(
    Math.min(projectionFullTime, 0.001),
    Math.min(projectionFullTime, requestedProjectionEnd - requestedProjectionStart),
  );
  const projectionWindowStart = Math.max(
    0,
    Math.min(requestedProjectionStart, projectionFullTime - projectionWindowSpan),
  );
  const projectionWindowEnd = projectionWindowStart + projectionWindowSpan;
  const projectionZoomLevel = projectionFullTime / projectionWindowSpan;
  const visibleProjectionPoints = projectionPoints.length
    ? [
        {
          elapsedSeconds: projectionWindowStart,
          researchPoints: interpolateResearchPoints(projectionPoints, projectionWindowStart),
        },
        ...projectionPoints.filter(
          (point) =>
            point.elapsedSeconds > projectionWindowStart &&
            point.elapsedSeconds < projectionWindowEnd,
        ),
        {
          elapsedSeconds: projectionWindowEnd,
          researchPoints: interpolateResearchPoints(projectionPoints, projectionWindowEnd),
        },
      ]
    : [];
  const visibleResearchValues = visibleProjectionPoints.map((point) => point.researchPoints);
  const visibleRpMin = visibleResearchValues.length ? Math.min(...visibleResearchValues) : 0;
  const visibleRpMax = visibleResearchValues.length ? Math.max(...visibleResearchValues) : 1;
  const visibleRpPadding = Math.max((visibleRpMax - visibleRpMin) * 0.08, visibleRpMax * 0.01, 1);
  const projectionRpMin = Math.max(0, visibleRpMin - visibleRpPadding);
  const projectionRpMax = visibleRpMax + visibleRpPadding;
  const projectionToX = (time: number) =>
    projectionPlot.left +
    ((time - projectionWindowStart) / projectionWindowSpan) *
      (projectionPlot.right - projectionPlot.left);
  const projectionToY = (rp: number) =>
    projectionPlot.bottom -
    ((rp - projectionRpMin) / (projectionRpMax - projectionRpMin)) *
      (projectionPlot.bottom - projectionPlot.top);
  const projectionLine = visibleProjectionPoints
    .map((point) => {
      return `${projectionToX(point.elapsedSeconds)},${projectionToY(point.researchPoints)}`;
    })
    .join(' ');
  const projectionEndRp = projectionPoints.length
    ? interpolateResearchPoints(projectionPoints, projectionWindowEnd)
    : 0;
  const projectionEndX = projectionToX(projectionWindowEnd);
  const projectionEndY = projectionToY(projectionEndRp);

  const zoomProjectionTime = useCallback((factor: number, anchor = 0.5) => {
    const currentStart = projectionWindowStart;
    const currentEnd = projectionWindowEnd;
    const currentSpan = currentEnd - currentStart;
    const nextSpan = Math.max(
      Math.min(projectionFullTime, 0.001),
      Math.min(projectionFullTime, currentSpan * factor),
    );
    const anchorTime = currentStart + currentSpan * anchor;
    const nextStart = Math.max(
      0,
      Math.min(anchorTime - nextSpan * anchor, projectionFullTime - nextSpan),
    );
    setProjectionTimeWindow({
      start: nextStart,
      end: nextStart + nextSpan,
      projectionKey: projectionStateKey,
    });
    setInspectedProjection(null);
  }, [
    projectionFullTime,
    projectionStateKey,
    projectionWindowEnd,
    projectionWindowStart,
  ]);

  const handleProjectionPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const svgX = getProjectionSvgX(event.currentTarget, event.clientX, event.clientY);
    if (svgX === null) return;
    event.preventDefault();
    projectionDragRef.current = {
      svgX,
      start: projectionWindowStart,
      end: projectionWindowEnd,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleProjectionPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svgX = getProjectionSvgX(event.currentTarget, event.clientX, event.clientY);
    if (svgX === null) return;
    const drag = projectionDragRef.current;
    if (drag) {
      event.preventDefault();
      const pointerDelta = svgX - drag.svgX;
      if (!drag.moved && Math.abs(pointerDelta) < 5) return;
      drag.moved = true;
      setIsProjectionPanning(true);
      const delta = ((drag.svgX - svgX) / (projectionPlot.right - projectionPlot.left)) *
        (drag.end - drag.start);
      const span = drag.end - drag.start;
      const start = Math.max(0, Math.min(drag.start + delta, projectionFullTime - span));
      setProjectionTimeWindow({
        start,
        end: start + span,
        projectionKey: projectionStateKey,
      });
      setInspectedProjection(null);
    }
  };

  const inspectProjectionAtPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svgX = getProjectionSvgX(event.currentTarget, event.clientX, event.clientY);
    if (svgX === null || svgX < projectionPlot.left || svgX > projectionPlot.right) {
      setInspectedProjection(null);
      return;
    }
    const fraction = (svgX - projectionPlot.left) / (projectionPlot.right - projectionPlot.left);
    const elapsedSeconds = projectionWindowStart + projectionWindowSpan * fraction;
    const researchPoints = interpolateResearchPoints(projectionPoints, elapsedSeconds);
    const rpPerSecond = calculateResearchOutput(
      researchInfrastructure,
      researchPoints,
    ).currentRpPerSecond;
    const step = researchProjection?.researchSteps.find(
      (researchStep) =>
        elapsedSeconds >= researchStep.startSeconds && elapsedSeconds < researchStep.endSeconds,
    );
    const researchName = step?.name ??
      (researchProjectionMode === 'chain' &&
      researchProjection?.elapsedSeconds !== null &&
      researchProjection?.elapsedSeconds !== undefined &&
      elapsedSeconds >= researchProjection.elapsedSeconds
        ? 'Chain complete'
        : null);
    setInspectedProjection({
      x: svgX,
      y: projectionToY(researchPoints),
      elapsedSeconds,
      researchPoints,
      rpPerSecond,
      researchName,
      projectionKey: projectionStateKey,
    });
  };

  const handleProjectionPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = projectionDragRef.current;
    if (drag && !drag.moved) inspectProjectionAtPointer(event);
    projectionDragRef.current = null;
    setIsProjectionPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleProjectionPointerCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    projectionDragRef.current = null;
    setIsProjectionPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const hasResearchProjection = researchProjection !== null;
  useEffect(() => {
    const chart = projectionChartRef.current;
    if (!chart) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const svgX = getProjectionSvgX(chart, event.clientX, event.clientY);
      if (svgX === null) return;
      const anchor = Math.max(
        0,
        Math.min(
          (svgX - projectionPlot.left) / (projectionPlot.right - projectionPlot.left),
          1,
        ),
      );
      zoomProjectionTime(event.deltaY < 0 ? 0.8 : 1.25, anchor);
    };

    chart.addEventListener('wheel', handleWheel, { passive: false });
    return () => chart.removeEventListener('wheel', handleWheel);
  }, [hasResearchProjection, projectionPlot.left, projectionPlot.right, zoomProjectionTime]);

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
    <div className={styles['research-overlay']} onClick={handleCloseResearchOverlay}>
      <div className={styles['research-modal']} onClick={(event) => event.stopPropagation()}>
        <div className={styles['research-header']}>
          <div className={styles['research-title']}>
            <Settings size={18} />
            <span>Research Overlay</span>
          </div>
          <button
            className={styles['research-close']}
            onClick={handleCloseResearchOverlay}
            aria-label="Close research overlay"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles['research-tabs']}>
          {OVERLAY_TABS.map((tab, index) => (
            <Fragment key={tab}>
              {index === 1 && (
                <span className={styles['research-tab-separator']} aria-hidden="true" />
              )}
              <button
                className={`${styles['research-tab']} ${
                  activeTab === tab ? styles['is-active'] : ''
                }`}
                onClick={() => {
                  setActiveTab(tab);
                }}
              >
                {tab}
              </button>
            </Fragment>
          ))}
        </div>

        {isSelectingTargetResearches && (
          <div className={styles['research-target-selection-banner']}>
            Click locked researches to add or remove them as targets. Return to RP Calculator and click Finish target selection.
          </div>
        )}

        {activeTab === 'RP Calculator' ? (
          <div className={styles['research-rates-view']}>
            <div className={styles['research-rates-heading']}>
              <div className={styles['research-rates-title']}>
                <FlaskConical size={20} />
                <h2>RP Calculator</h2>
              </div>
              <label className={styles['research-rp-input-row']}>
                <span>Current RP</span>
                <ValidatedNumberInput
                  className={styles['research-current-rp']}
                  value={currentResearchPoints}
                  onChange={setCurrentResearchPoints}
                  defaultValue={0}
                  allowDecimals={false}
                  allowNegatives={false}
                  min={0}
                  step={1}
                />
              </label>
            </div>

            <section className={styles['research-total-panel']}>
              <span>Total RP{rpRateSuffix}</span>
              <strong className={styles['research-total-value']}>
                {formatQuantity(researchOutput.currentRpPerSecond)} <span>RP{rpRateSuffix}</span>
              </strong>
            </section>

            <section className={styles['research-tier-section']}>
              <div className={styles['research-tier-grid']}>
                {(
                  [
                    {
                      id: 'RS1',
                      output: researchOutput.researchStation1,
                    },
                    {
                      id: 'RS2',
                      output: researchOutput.researchStation2,
                    },
                    {
                      id: 'RS3',
                      output: researchOutput.researchStation3,
                    },
                    {
                      id: 'RS4',
                      output: researchOutput.researchStation4,
                    },
                  ] as const
                ).map(({ id, output }) => {
                  return (
                    <article key={id} className={styles['research-tier-card']}>
                      <div className={styles['research-tier-card-header']}>
                        <h4>{id}</h4>
                      </div>
                      <div className={styles['research-tier-metrics']}>
                        <div className={styles['research-tier-metric']}>
                          <span>RP{rpRateSuffix}</span>
                          <strong>{formatQuantity(output.rpPerSecond)}</strong>
                        </div>
                        <div className={styles['research-tier-metric']}>
                          <span>RP Cap</span>
                          <strong>RP {formatResearchNumber(output.rpCap, 0)}</strong>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className={styles['research-satellite-panel']}>
              <h3>Satellite Buff</h3>
              <div className={styles['research-satellite-metrics']}>
                <div>
                  <span>RP{rpRateSuffix} increase</span>
                  <strong>+{formatResearchNumber(researchOutput.satelliteBoostPercent)}%</strong>
                </div>
                <div>
                  <span>Added RP{rpRateSuffix}</span>
                  <strong>+{formatQuantity(researchOutput.satelliteBonusRpPerSecond)}</strong>
                </div>
                <div>
                  <span>Efficiency</span>
                  <strong>{formatResearchNumber(researchOutput.satelliteEfficiencyPercent)}%</strong>
                </div>
                <div>
                  <span>Dishes · canvas / optimal</span>
                  <strong>
                    {formatResearchNumber(researchInfrastructure.satelliteDishCount, 2)} /{' '}
                    {formatResearchNumber(researchInfrastructure.optimalSatelliteDishCount, 0)}
                  </strong>
                </div>
              </div>
            </section>

            <section className={styles['research-target-panel']}>
              <label className={styles['research-rp-input-row']}>
                <span>Target RP</span>
                <ValidatedNumberInput
                  className={styles['research-current-rp']}
                  value={targetResearchPoints}
                  onChange={handleTargetResearchPointsChange}
                  onEmptyChange={handleClearTargetResearchPoints}
                  defaultValue={0}
                  allowDecimals={false}
                  allowNegatives={false}
                  allowEmpty
                  min={0}
                  step={1}
                />
              </label>
              <div className={styles['research-target-research']}>
                <div className={styles['research-target-research-cost']}>
                  <span>Target researches</span>
                  <strong>
                    {activeTargetResearchCount
                      ? `${activeTargetResearchCount} selected`
                      : 'None selected'}
                  </strong>
                </div>
                <button
                  className={styles['research-target-button']}
                  onClick={
                    isSelectingTargetResearches
                      ? handleFinishTargetResearchSelection
                      : handleStartTargetResearchSelection
                  }
                  disabled={isSandbox && !isSelectingTargetResearches}
                  title={
                    isSelectingTargetResearches
                      ? 'Finish target selection and calculate the combined unlock chain'
                      : 'Select target researches from the research graphs'
                  }
                >
                  {isSelectingTargetResearches ? 'Finish target selection' : 'Select target researches'}
                </button>
                <span className={styles['research-chain-note']}>
                  Chain includes locked researches only
                </span>
              </div>
            </section>

            <section className={styles['research-projection-panel']}>
              <div className={styles['research-projection-header']}>
                <div className={styles['research-projection-title']}>
                  <h3>RP over time</h3>
                  <span>Scroll to zoom · drag to pan · click for details</span>
                </div>
                <div className={styles['research-projection-controls']}>
                  <button
                    type="button"
                    className={styles['research-projection-control']}
                    onClick={() => zoomProjectionTime(1.4)}
                    disabled={!researchProjection}
                    aria-label="Zoom out on RP graph"
                    title="Zoom out"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className={styles['research-projection-control']}
                    onClick={() => zoomProjectionTime(0.7)}
                    disabled={!researchProjection}
                    aria-label="Zoom in on RP graph"
                    title="Zoom in"
                  >
                    +
                  </button>
                  <span
                    className={styles['research-projection-zoom-level']}
                    title="Time axis zoom level"
                  >
                    {formatResearchNumber(projectionZoomLevel, 1)}×
                  </span>
                  <button
                    type="button"
                    className={styles['research-projection-control']}
                    onClick={() => {
                      setProjectionTimeWindow(null);
                      setInspectedProjection(null);
                    }}
                    disabled={!researchProjection || activeProjectionTimeWindow === null}
                    title="Fit entire projection"
                  >
                    Fit
                  </button>
                </div>
                <div className={styles['research-projection-eta']}>
                  <span>
                    {researchProjectionMode === 'chain'
                      ? `Time to unlock ${researchUnlockChain.length} researches`
                      : 'Time to target RP'}
                  </span>
                  <strong
                    title={
                      researchProjection?.failureReason === 'precision-limit'
                        ? 'The integration limit was reached; this is the best available time estimate.'
                        : undefined
                    }
                  >
                    {!researchProjection
                      ? '—'
                      : researchProjection.reachedTarget && researchProjection.elapsedSeconds !== null
                        ? `${researchProjection.failureReason === 'precision-limit' ? '≈' : ''}${formatLongTime(researchProjection.elapsedSeconds)}`
                        : researchProjection.failureReason === 'precision-limit'
                          ? 'Estimate did not converge'
                          : 'Cannot reach target'}
                  </strong>
                </div>
              </div>
              {researchProjection ? (
                <svg
                  ref={projectionChartRef}
                  className={`${styles['research-projection-chart']} ${isProjectionPanning ? styles['is-panning'] : ''}`}
                  viewBox="0 0 960 320"
                  role="img"
                  onPointerDown={handleProjectionPointerDown}
                  onPointerMove={handleProjectionPointerMove}
                  onPointerUp={handleProjectionPointerUp}
                  onPointerCancel={handleProjectionPointerCancel}
                  onDragStart={(event) => event.preventDefault()}
                  aria-label={
                    researchProjectionMode === 'chain'
                      ? 'Research point balance over time while completing the unlock chain'
                      : 'Research points over time until the target is reached'
                  }
                >
                  {Array.from({ length: 9 }, (_, tick) => tick).map((tick) => {
                    const researchPoints =
                      projectionRpMin + ((projectionRpMax - projectionRpMin) * tick) / 8;
                    const y =
                      projectionToY(researchPoints);
                    return (
                      <g key={`y-${tick}`}>
                        <line
                          x1={projectionPlot.left}
                          x2={projectionPlot.right}
                          y1={y}
                          y2={y}
                          className={styles['research-projection-gridline']}
                        />
                        <text
                          x={projectionPlot.left - 10}
                          y={y + 4}
                          textAnchor="end"
                          className={styles['research-projection-axis-label']}
                        >
                          {formatQuantity(researchPoints, 2, 2)}
                        </text>
                      </g>
                    );
                  })}
                  {Array.from({ length: 9 }, (_, tick) => tick).map((tick) => {
                    const elapsedSeconds =
                      projectionWindowStart + (projectionWindowSpan * tick) / 8;
                    const x = projectionToX(elapsedSeconds);
                    return (
                      <g key={`x-${tick}`}>
                        <line
                          x1={x}
                          x2={x}
                          y1={projectionPlot.top}
                          y2={projectionPlot.bottom}
                          className={styles['research-projection-gridline']}
                        />
                        <text
                          x={x}
                          y={projectionPlot.bottom + 22}
                          textAnchor="middle"
                          className={styles['research-projection-axis-label']}
                        >
                          {formatLongTime(elapsedSeconds, true, 2)}
                        </text>
                      </g>
                    );
                  })}
                  <polyline
                    points={projectionLine}
                    className={styles['research-projection-line']}
                  />
                  {projectionWindowEnd >= projectionFullTime && (
                    <circle
                      cx={projectionEndX}
                      cy={projectionEndY}
                      r={4}
                      className={styles['research-projection-endpoint']}
                    />
                  )}
                  {activeInspectedProjection && (
                    <g className={styles['research-projection-hover']} pointerEvents="none">
                      <line
                        x1={activeInspectedProjection.x}
                        x2={activeInspectedProjection.x}
                        y1={projectionPlot.top}
                        y2={projectionPlot.bottom}
                        className={styles['research-projection-hover-line']}
                      />
                      <circle
                        cx={activeInspectedProjection.x}
                        cy={activeInspectedProjection.y}
                        r={4}
                        className={styles['research-projection-hover-point']}
                      />
                      {(() => {
                        const tooltipWidth = 250;
                        const tooltipHeight = activeInspectedProjection.researchName ? 82 : 64;
                        const tooltipX = Math.max(
                          projectionPlot.left,
                          Math.min(activeInspectedProjection.x + 10, projectionPlot.right - tooltipWidth),
                        );
                        return (
                          <g transform={`translate(${tooltipX}, ${projectionPlot.top + 6})`}>
                            <rect
                              width={tooltipWidth}
                              height={tooltipHeight}
                              rx={3}
                              className={styles['research-projection-tooltip-bg']}
                            />
                            <text x={9} y={15} className={styles['research-projection-tooltip-text']}>
                              Time · {formatLongTime(activeInspectedProjection.elapsedSeconds)}
                            </text>
                            <text x={9} y={31} className={styles['research-projection-tooltip-text']}>
                              RP · {formatQuantity(activeInspectedProjection.researchPoints)}
                            </text>
                            <text x={9} y={47} className={styles['research-projection-tooltip-text']}>
                              RP{rpRateSuffix} · {formatQuantity(activeInspectedProjection.rpPerSecond)}
                            </text>
                            {activeInspectedProjection.researchName && (
                              <text x={9} y={65} className={styles['research-projection-tooltip-text']}>
                                Researching · {activeInspectedProjection.researchName.slice(0, 28)}
                              </text>
                            )}
                          </g>
                        );
                      })()}
                    </g>
                  )}
                  <text
                    x={(projectionPlot.left + projectionPlot.right) / 2}
                    y={310}
                    textAnchor="middle"
                    className={styles['research-projection-axis-title']}
                  >
                    ELAPSED TIME
                  </text>
                  <text
                    x={15}
                    y={(projectionPlot.top + projectionPlot.bottom) / 2}
                    textAnchor="middle"
                    transform={`rotate(-90 15 ${(projectionPlot.top + projectionPlot.bottom) / 2})`}
                    className={styles['research-projection-axis-title']}
                  >
                    RP BALANCE
                  </text>
                </svg>
              ) : (
                <div className={styles['research-projection-empty']}>
                  {isSelectingTargetResearches
                    ? 'Finish target selection to generate the RP over time graph.'
                    : 'Set a target RP or select target researches to generate the RP over time graph.'}
                </div>
              )}
            </section>

          </div>
        ) : (
          <div className={styles['research-content']}>
            <aside className={styles['research-sidebar']}>
              <div className={styles['sidebar-section']}>
                <div className={styles['sidebar-section-title']}>Options</div>

                <label className={styles['option-row']}>
                  <span className={styles['option-label']}>Difficulty</span>
                  <select
                    className={styles['option-select']}
                    value={difficulty}
                    onChange={(e) => handleDifficultyChange(e.target.value as GameDifficulty)}
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
                      <div className={styles['sidebar-empty']}>
                        No machine requires this research.
                      </div>
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

            <div className={styles['research-graph-pane']}>
              <ReactFlowProvider>
                <MachineResearchGraph
                  key={`${activeTab}-${dbVersion}`}
                  category={activeTab}
                  dbVersion={dbVersion}
                  selectedResearchId={selectedResearchId}
                  targetResearchIds={activeTargetResearchIds}
                  isSelectingTargets={isSelectingTargetResearches}
                  unlockedResearchIds={unlockedResearchIds}
                  blockedIds={blockedIds}
                  onSelectResearch={setSelectedResearchId}
                  onToggleTargetResearch={handleTargetResearchNodeClick}
                />
              </ReactFlowProvider>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
