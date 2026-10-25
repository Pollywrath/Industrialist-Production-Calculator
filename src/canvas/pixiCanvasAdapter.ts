import type { Application } from 'pixi.js';
import {
  attachGraphCanvas,
  createGraphTypeRegistry,
  GraphStore,
  type CanvasSelectionState,
  type CanvasActionDecision,
  type CanvasActionProposal,
  type GraphBounds,
  type GraphCanvasApi,
  type GraphTypeRegistry,
  type GroupTypeDefinition,
  type ViewportStore,
  type Viewport,
} from './pixiEngine';
import { MIN_ZOOM, ViewportStore as PixiViewportStore } from './pixiEngine';
import { getEffectiveToggleId, useUIStore } from '../stores/useUIStore';
import { useEdgeThemeStore } from '../stores/useEdgeThemeStore';
import { useFlowStore } from '../stores/useFlowStore';
import { useFlowResultStore } from '../stores/useFlowResultStore';
import { useDataStore } from '../stores/useDataStore';
import { useGlobalSettingsStore } from '../stores/useGlobalSettingsStore';
import type { Recipe } from '../types/data';
import { getRecipe, resolveActiveRecipe } from '../data/lookup';
import { getSpecialRecipe } from '../data/registry';
import { isAppConnectionValid, resolveAppConnection } from './connectionValidation';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
} from '../stores/useTutorialStore';
import type { TutorialActionEvent } from '../tutorials/types';
import { buildHandleId, parseHandleId } from '../utils/idGenerator';
import { isGroupNode, isRecipeNode } from '../types/nodes';
import { createGraphResolutionContext } from '../utils/graphResolutionContext';
import {
  createPixiActiveRecipeCache,
  type PixiRecipeResolutionHelpers,
} from './pixiActiveRecipeCache';
import {
  registerCanvasAdapter,
  getViewportCenteredOnGraphPoint,
  type CanvasAdapterApi,
  type CanvasEdgeClickListener,
  type CanvasBounds,
  type CanvasPoint,
} from './canvasAdapterApi';
import { projectAppGraphToPixiV1 } from './pixiGraphProjection';
import { applyPixiCanvasModeAction } from './pixiCanvasModeAction';
import {
  isPixiTutorialAuthorizationRequired,
  shouldPixiProposalAdvanceTutorial,
} from './pixiTutorialGesturePolicy';
import { applyConnectedPortRate } from './portRateAction';
import { activatePixiPortRow } from './pixiPortRowActivation';
import { SNAP_GRID } from '../constants/layoutConstants';
import { GROUP_HEADER_HEIGHT, GROUP_PADDING_X, GROUP_PADDING_Y } from '../utils/groupBounds';
import {
  createPixiRecipePresentationCache,
  type PixiRecipePresentation,
} from './pixiRecipePresentation';
import type { PixiGraphProjectionV1 } from './pixiGraphProjection';

interface GroupPresentationData {
  bounds: GraphBounds;
  memberPositions: Readonly<Record<string, { x: number; y: number }>>;
}

export interface PixiCanvasAdapterHandle {
  readonly editor: GraphCanvasApi;
  readonly camera: ViewportStore;
  fitGraph(): void;
  destroy(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readGroupBounds(value: unknown): GraphBounds | null {
  if (!isRecord(value) || !isRecord(value.bounds)) return null;
  const { x, y, width, height } = value.bounds;
  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return null;
  }
  return { x, y, width, height };
}

function createGroupTypeDefinition(): GroupTypeDefinition {
  return {
    type: 'group',
    projection: 'container-proxy',
    getBounds(group, members, presentationData) {
      const baseBounds = readGroupBounds(presentationData);
      if (!baseBounds || !isRecord(presentationData)) return baseBounds;
      const memberPositions = presentationData.memberPositions;
      if (!isRecord(memberPositions)) return baseBounds;
      const deltas = members.flatMap((member) => {
        const position = memberPositions[member.node.id];
        return isRecord(position) &&
          typeof position.x === 'number' &&
          typeof position.y === 'number'
          ? [{ x: member.position.x - position.x, y: member.position.y - position.y }]
          : [];
      });
      if (deltas.length === 0 || deltas.every((delta) => delta.x === 0 && delta.y === 0))
        return baseBounds;
      const firstDelta = deltas[0];
      if (
        firstDelta &&
        deltas.every((delta) => delta.x === firstDelta.x && delta.y === firstDelta.y)
      ) {
        return {
          ...baseBounds,
          x: baseBounds.x + firstDelta.x,
          y: baseBounds.y + firstDelta.y,
        };
      }
      if (group.collapsed) return baseBounds;
      const minX = Math.min(...members.map((member) => member.bounds.x));
      const minY = Math.min(...members.map((member) => member.bounds.y));
      const maxX = Math.max(...members.map((member) => member.bounds.x + member.bounds.width));
      const maxY = Math.max(...members.map((member) => member.bounds.y + member.bounds.height));
      const x = Math.round((minX - GROUP_PADDING_X) / SNAP_GRID[0]) * SNAP_GRID[0];
      const y =
        Math.round((minY - GROUP_HEADER_HEIGHT - GROUP_PADDING_Y) / SNAP_GRID[1]) * SNAP_GRID[1];
      const right = maxX + GROUP_PADDING_X;
      const bottom = maxY + GROUP_PADDING_Y;
      return {
        x,
        y,
        width: Math.max(SNAP_GRID[0], right - x),
        height: Math.max(SNAP_GRID[1], bottom - y),
      };
    },
  };
}

function createTypeRegistry(): GraphTypeRegistry {
  return createGraphTypeRegistry({ groups: { group: createGroupTypeDefinition() } });
}

function resolveGroupPresentationData(groupId: string): GroupPresentationData | null {
  const flowState = useFlowStore.getState();
  const node = flowState.nodesMap.get(groupId);
  if (!isGroupNode(node)) return null;
  if (
    typeof node.width !== 'number' ||
    !Number.isFinite(node.width) ||
    typeof node.height !== 'number' ||
    !Number.isFinite(node.height)
  ) {
    return null;
  }
  return {
    bounds: {
      x: node.position.x,
      y: node.position.y,
      width: node.width,
      height: node.height,
    },
    memberPositions: Object.fromEntries(
      (flowState.groupMemberIds[groupId] ?? []).flatMap((memberId) => {
        const member = flowState.nodesMap.get(memberId);
        return isRecipeNode(member) ? [[member.id, { ...member.position }]] : [];
      }),
    ),
  };
}

function reconcileAppSelection(selection: CanvasSelectionState | null): void {
  const selectedIds = new Set(selection?.nodeIds ?? []);
  const selectedNodeIds = new Set(selection?.nodeIds ?? []);
  if (selection?.target.type === 'group') selectedNodeIds.add(selection.target.id);
  const flowStore = useFlowStore.getState();
  const nodeSelectionChanges = flowStore.nodes
    .filter((node) => node.selected !== selectedNodeIds.has(node.id))
    .map((node) => ({
      id: node.id,
      type: 'select' as const,
      selected: selectedNodeIds.has(node.id),
    }));
  if (nodeSelectionChanges.length > 0) flowStore.onNodesChange(nodeSelectionChanges);

  const selectedEdgeId = selection?.target.type === 'edge' ? selection.target.id : null;
  const edgeSelectionChanges = flowStore.edges
    .filter((edge) => edge.selected !== (edge.id === selectedEdgeId))
    .map((edge) => ({
      id: edge.id,
      type: 'select' as const,
      selected: edge.id === selectedEdgeId,
    }));
  if (edgeSelectionChanges.length > 0) flowStore.onEdgesChange(edgeSelectionChanges);

  for (const node of flowStore.nodes) {
    if (!isRecipeNode(node) || node.data.groupId) continue;
    if (!!node.data.isMultiSelected !== selectedIds.has(node.id)) {
      useFlowStore.getState().toggleNodeSelection(node.id);
    }
  }
}

function reconcileCanvasSelection(
  editor: GraphCanvasApi,
  flowState: ReturnType<typeof useFlowStore.getState>,
): void {
  const { nodes, edges, groupMemberIds } = flowState;
  const isMultiSelectMode = getEffectiveToggleId(useUIStore.getState()) === 'multi_select';
  const selectedGroup = nodes.find((node) => isGroupNode(node) && node.selected);
  if (selectedGroup) {
    editor.selectGroup(selectedGroup.id);
    return;
  }

  const collapsedMemberIds = new Set(
    nodes
      .filter(isGroupNode)
      .filter((group) => group.data.collapsed)
      .flatMap((group) => groupMemberIds[group.id] ?? []),
  );
  const selectedNodeIds = nodes
    .filter(isRecipeNode)
    .filter((node) => !collapsedMemberIds.has(node.id))
    .filter((node) =>
      isMultiSelectMode ? node.data.isMultiSelected === true : node.selected === true,
    )
    .map((node) => node.id);
  if (selectedNodeIds.length > 0) {
    editor.selectNodes(selectedNodeIds, selectedNodeIds.at(-1));
    return;
  }

  const selectedEdge = edges.find((edge) => edge.selected && !edge.id.startsWith('proxy-'));
  if (selectedEdge) {
    editor.selectEdge(selectedEdge.id);
    return;
  }

  editor.clearSelection();
}

function projectCurrentFlow(
  flowState: ReturnType<typeof useFlowStore.getState>,
  edgeStyle: ReturnType<typeof useEdgeThemeStore.getState>,
  presentationCache: ReturnType<typeof createPixiRecipePresentationCache>,
  activeRecipeCache: ReturnType<typeof createPixiActiveRecipeCache>,
  themeVersion: number,
  previousProjection?: PixiGraphProjectionV1,
) {
  const resultState = useFlowResultStore.getState();
  const dataDbVersion = useDataStore.getState().dbVersion;
  const isSolveFresh =
    resultState.graphVersion === flowState.graphVersion &&
    resultState.dataDbVersion === dataDbVersion;
  const rateMode = useUIStore.getState().rateMode;
  const globalSettings = useGlobalSettingsStore.getState().settings as unknown as Record<
    string,
    unknown
  >;
  const recipePresentationByNodeId = new Map<string, PixiRecipePresentation>();
  const activeRecipeByNodeId = new Map<string, Recipe>();
  const recipeNodeIds = new Set<string>();
  const recipeNodes = flowState.nodes.filter(isRecipeNode);
  const recipeNodeIdSet = new Set(recipeNodes.map((node) => node.id));
  const needsSpecialRecipeResolution = recipeNodes.some(
    (node) =>
      getSpecialRecipe(node.data.recipeId) && !(isSolveFresh && resultState.nodeRecipes[node.id]),
  );
  const recipeEdges = needsSpecialRecipeResolution
    ? flowState.edges.filter(
        (edge) => recipeNodeIdSet.has(edge.source) && recipeNodeIdSet.has(edge.target),
      )
    : [];
  const resolutionContext = needsSpecialRecipeResolution
    ? createGraphResolutionContext(recipeNodes, recipeEdges)
    : null;
  const recipeEdgeFlows = resultState.edgeFlows;

  for (const node of flowState.nodes) {
    if (!isRecipeNode(node)) continue;
    recipeNodeIds.add(node.id);
    const solvedRecipe = isSolveFresh ? resultState.nodeRecipes[node.id] : undefined;
    const specialRecipe = getSpecialRecipe(node.data.recipeId);
    let recipe = solvedRecipe;
    if (!recipe && specialRecipe) {
      if (!resolutionContext) throw new Error('Missing special recipe resolution context.');
      recipe = activeRecipeCache.get(
        {
          node,
          globalSettings,
          dataDbVersion,
          inputTemperatures: resultState.inputTemps[node.id],
          createHelpers: () => {
            const resolutionHelpers = resolutionContext.createHelpers(node.id);
            const helpers: PixiRecipeResolutionHelpers = {
              ...resolutionHelpers,
              resolveProduct: (side, index) => {
                const handleId = buildHandleId(node.id, side, index);
                return (
                  resultState.resolvedProducts[handleId] ??
                  resolutionHelpers.resolveProduct(side, index)
                );
              },
              getFlowRate: (side, index) => {
                const handleId = buildHandleId(node.id, side, index);
                return (resolutionContext.edgeLookup.get(handleId) ?? []).reduce(
                  (total, edge) => total + (recipeEdgeFlows[edge.id] ?? 0),
                  0,
                );
              },
            };
            return helpers;
          },
        },
        (helpers) =>
          resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id, helpers, {
            globalSettings,
          }),
      );
    } else if (!recipe) {
      recipe = getRecipe(node.data.recipeId) ?? resultState.nodeRecipes[node.id];
    }
    if (!recipe) continue;
    activeRecipeByNodeId.set(node.id, recipe);
    recipePresentationByNodeId.set(
      node.id,
      presentationCache.get(
        {
          node,
          recipe,
          rateMode,
          flowResult: isSolveFresh ? resultState.results.get(node.id) : undefined,
          isSolveFresh,
          resolvedProducts: resultState.resolvedProducts,
          inputTemperatures: resultState.inputTemps[node.id],
        },
        { dataDbVersion, themeVersion },
      ),
    );
  }
  presentationCache.retainNodeIds(recipeNodeIds);
  activeRecipeCache.retainNodeIds(recipeNodeIds);

  return projectAppGraphToPixiV1({
    nodes: flowState.nodes,
    edges: flowState.edges,
    groupMemberIds: flowState.groupMemberIds,
    edgeStyle,
    recipePresentationByNodeId,
    activeRecipeByNodeId,
    previousProjection,
  });
}

function createSurfaceApi(
  editor: GraphCanvasApi,
  host: HTMLElement,
  camera: PixiViewportStore,
  edgeClickListeners: Set<CanvasEdgeClickListener>,
): CanvasAdapterApi {
  const toPageBounds = (bounds: CanvasBounds | null, space: 'graph' | 'screen' = 'graph') => {
    if (!bounds || space === 'graph') return bounds;
    const hostBounds = host.getBoundingClientRect();
    return { ...bounds, x: bounds.x + hostBounds.left, y: bounds.y + hostBounds.top };
  };

  return {
    canvasType: 'pixi',
    screenToGraph(point: CanvasPoint) {
      const bounds = host.getBoundingClientRect();
      return editor.screenToGraph({ x: point.x - bounds.left, y: point.y - bounds.top });
    },
    getViewport() {
      return camera.getState();
    },
    getViewState() {
      const viewport = camera.getState();
      return {
        center: { x: -viewport.x / viewport.zoom, y: -viewport.y / viewport.zoom },
        zoom: viewport.zoom,
      };
    },
    setViewState(viewState) {
      const zoom = Math.max(MIN_ZOOM, Math.min(viewState.zoom, 3));
      camera.setViewport({ x: -viewState.center.x * zoom, y: -viewState.center.y * zoom, zoom });
    },
    centerOnGraphPoint(point: CanvasPoint, zoom: number) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(zoom)) return;
      const targetZoom = Math.max(MIN_ZOOM, Math.min(zoom, 3));
      camera.setViewport(getViewportCenteredOnGraphPoint(point, targetZoom));
    },
    fitGraph() {
      editor.fitGraph();
    },
    getNodeBounds(nodeId, space) {
      return toPageBounds(editor.getNodeBounds(nodeId, space) as CanvasBounds | null, space);
    },
    getPortBounds(nodeId, portId, space) {
      return toPageBounds(
        editor.getPortBounds(nodeId, portId, space) as CanvasBounds | null,
        space,
      );
    },
    getPortRowBounds(nodeId, portId, space) {
      return toPageBounds(
        editor.getPortRowBounds(nodeId, portId, space) as CanvasBounds | null,
        space,
      );
    },
    getControlBounds(entityId, controlIdOrAction, space) {
      return toPageBounds(
        editor.getControlBounds(entityId, controlIdOrAction, space) as CanvasBounds | null,
        space,
      );
    },
    getGroupHeaderBounds(groupId, space) {
      return toPageBounds(
        editor.getGroupHeaderBounds(groupId, space) as CanvasBounds | null,
        space,
      );
    },
    getEdgeGeometry(edgeId, space) {
      const geometry = editor.getEdgeGeometry(edgeId, space) as {
        points: readonly CanvasPoint[];
        bounds: CanvasBounds;
      } | null;
      if (!geometry || space !== 'screen') return geometry;
      const hostBounds = host.getBoundingClientRect();
      return {
        bounds: {
          ...geometry.bounds,
          x: geometry.bounds.x + hostBounds.left,
          y: geometry.bounds.y + hostBounds.top,
        },
        points: geometry.points.map((point) => ({
          x: point.x + hostBounds.left,
          y: point.y + hostBounds.top,
        })),
      };
    },
    subscribeViewport(listener) {
      return editor.subscribeViewport(listener);
    },
    subscribeResize(listener) {
      return editor.subscribeResize(listener);
    },
    subscribeScene(listener) {
      return editor.subscribeScene(listener);
    },
    subscribeEdgeClick(listener) {
      edgeClickListeners.add(listener);
      return () => edgeClickListeners.delete(listener);
    },
    exportCanvasPng(options) {
      return editor.exportCanvasPng(options);
    },
    selectNodes(nodeIds, primaryNodeId) {
      editor.selectNodes(nodeIds, primaryNodeId);
    },
    selectEdge(edgeId) {
      editor.selectEdge(edgeId);
    },
    selectGroup(groupId) {
      editor.selectGroup(groupId);
    },
  };
}

function toVisibleConnectionEndpoint(
  nodeId: string,
  portId: string,
  flowState: ReturnType<typeof useFlowStore.getState>,
) {
  const node = flowState.nodesMap.get(nodeId);
  if (!isRecipeNode(node) || !node.data.groupId) return { nodeId, portId };
  const group = flowState.nodesMap.get(node.data.groupId);
  const parsed = parseHandleId(portId);
  if (!isGroupNode(group) || !group.data.collapsed || !parsed) return { nodeId, portId };
  const handles =
    parsed.side === 'input' ? group.data.inputProxyHandleIds : group.data.outputProxyHandleIds;
  const proxyIndex = handles.indexOf(portId);
  if (proxyIndex < 0) return { nodeId, portId };
  return {
    nodeId: group.id,
    portId: buildHandleId(group.id, parsed.side, proxyIndex),
  };
}

function getTutorialEdgeEndpoints(edge: {
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
}) {
  const source = parseHandleId(edge.sourceHandle ?? '');
  const target = parseHandleId(edge.targetHandle ?? '');
  if (!source || !target || source.side !== 'output' || target.side !== 'input') return null;
  return {
    sourceNodeId: edge.source,
    sourceIndex: source.index,
    targetNodeId: edge.target,
    targetIndex: target.index,
  };
}

function getRealEdgeId(edgeId: string): string {
  return edgeId.startsWith('proxy-') ? edgeId.slice('proxy-'.length) : edgeId;
}

function tutorialActionForCanvasProposal(
  proposal: CanvasActionProposal,
  flowState: ReturnType<typeof useFlowStore.getState>,
): TutorialActionEvent | null {
  if (proposal.type === 'activate-control') {
    return proposal.action === 'node-menu' || proposal.action === 'group-menu'
      ? { type: 'node-editor-open', nodeId: proposal.entityId }
      : null;
  }
  if (proposal.type === 'activate-canvas-target') {
    const mode = getEffectiveToggleId(useUIStore.getState());
    if (proposal.target.type === 'port' && proposal.target.phase === 'double') {
      const parsed = parseHandleId(proposal.target.portId);
      return parsed && parsed.nodeId === proposal.target.nodeId
        ? {
            type: 'node-handle-double',
            nodeId: parsed.nodeId,
            side: parsed.side,
            index: parsed.index,
          }
        : null;
    }
    if (mode && mode !== 'target' && mode !== 'multi_select') return null;
    if (proposal.target.type === 'node' || proposal.target.type === 'port') {
      if (mode === 'target') {
        return { type: 'target-node', nodeId: proposal.target.nodeId };
      }
      if (mode === 'multi_select') {
        return { type: 'node-multi-select', nodeId: proposal.target.nodeId };
      }
    }
    if (proposal.target.type === 'node') {
      const node = flowState.nodesMap.get(proposal.target.nodeId);
      if (isGroupNode(node)) return { type: 'group-move', groupId: node.id };
      return { type: 'node-move', nodeId: proposal.target.nodeId };
    }
    if (proposal.target.type === 'group') {
      return { type: 'group-move', groupId: proposal.target.groupId };
    }
    if (proposal.target.type === 'edge') {
      const edgeId = getRealEdgeId(proposal.target.edgeId);
      const edge = flowState.edges.find((item) => item.id === edgeId);
      const endpoints = edge && getTutorialEdgeEndpoints(edge);
      return endpoints ? { type: 'edge-route-edit', ...endpoints } : null;
    }
    const parsed = parseHandleId(proposal.target.portId);
    if (!parsed || parsed.nodeId !== proposal.target.nodeId) return null;
    if (proposal.target.phase === 'double') {
      return {
        type: 'node-handle-double',
        nodeId: parsed.nodeId,
        side: parsed.side,
        index: parsed.index,
      };
    }
    if (proposal.target.phase === 'row') {
      return {
        type: 'node-rect',
        nodeId: parsed.nodeId,
        side: parsed.side,
        index: parsed.index,
      };
    }
    return {
      type: 'edge-connect-start',
      nodeId: parsed.nodeId,
      side: parsed.side,
      index: parsed.index,
    };
  }
  if (proposal.type === 'move-nodes') {
    if (proposal.groupId && isGroupNode(flowState.nodesMap.get(proposal.groupId))) {
      return { type: 'group-move', groupId: proposal.groupId };
    }
    const nodeId = proposal.positions[0]?.id;
    return nodeId ? { type: 'node-move', nodeId } : null;
  }
  if (proposal.type === 'connect') {
    const source = proposal.first.direction === 'output' ? proposal.first : proposal.second;
    const target = proposal.first.direction === 'input' ? proposal.first : proposal.second;
    const sourcePort = parseHandleId(source.portId);
    const targetPort = parseHandleId(target.portId);
    if (!sourcePort || !targetPort) return null;
    return {
      type: 'edge-connect',
      sourceNodeId: source.nodeId,
      sourceIndex: sourcePort.index,
      targetNodeId: target.nodeId,
      targetIndex: targetPort.index,
    };
  }
  if (proposal.type === 'reconnect') {
    const edgeId = getRealEdgeId(proposal.edgeId);
    const edge = flowState.edges.find(
      (item) => item.id === edgeId && !item.id.startsWith('proxy-'),
    );
    const endpoints = edge && getTutorialEdgeEndpoints(edge);
    const endpoint = toVisibleConnectionEndpoint(
      proposal.endpoint.nodeId,
      proposal.endpoint.portId,
      flowState,
    );
    const parsedEndpoint = parseHandleId(endpoint.portId);
    return endpoints && parsedEndpoint
      ? {
          type: 'edge-reconnect',
          ...endpoints,
          side: proposal.side,
          endpointNodeId: endpoint.nodeId,
          endpointIndex: parsedEndpoint.index,
        }
      : null;
  }
  if (proposal.type === 'set-edge-route' || proposal.type === 'delete-edge-route-point') {
    const edgeId = getRealEdgeId(proposal.edgeId);
    const edge = flowState.edges.find(
      (item) => item.id === edgeId && !item.id.startsWith('proxy-'),
    );
    const endpoints = edge && getTutorialEdgeEndpoints(edge);
    return endpoints ? { type: 'edge-route-edit', ...endpoints } : null;
  }
  if (proposal.type === 'start-reconnect') {
    const edgeId = getRealEdgeId(proposal.edgeId);
    const edge = flowState.edges.find(
      (item) => item.id === edgeId && !item.id.startsWith('proxy-'),
    );
    const endpoints = edge && getTutorialEdgeEndpoints(edge);
    return endpoints ? { type: 'edge-reconnect-start', ...endpoints, side: proposal.side } : null;
  }
  if (proposal.type === 'set-group-collapsed') {
    return {
      type: proposal.collapsed ? 'group-collapse' : 'group-expand',
      groupId: proposal.groupId,
    };
  }
  return null;
}

export function attachPixiCanvasAdapter(
  app: Application,
  host: HTMLElement,
  onUnavailable: (error: unknown) => void,
  initialViewport?: Viewport,
): PixiCanvasAdapterHandle {
  const typeRegistry = createTypeRegistry();
  const currentFlow = useFlowStore.getState();
  const currentStyle = useEdgeThemeStore.getState();
  const presentationCache = createPixiRecipePresentationCache();
  const activeRecipeCache = createPixiActiveRecipeCache();
  let themeVersion = 0;
  let currentProjection = projectCurrentFlow(
    currentFlow,
    currentStyle,
    presentationCache,
    activeRecipeCache,
    themeVersion,
  );
  const initialProjection = currentProjection;
  const graph = new GraphStore(initialProjection.graph, typeRegistry);
  const camera = new PixiViewportStore(initialViewport);
  const edgeClickListeners = new Set<CanvasEdgeClickListener>();
  let isApplyingCanvasSelection = false;
  const editor: GraphCanvasApi = attachGraphCanvas(app, host, {
    graph,
    camera,
    typeRegistry,
    interaction: {
      pan: true,
      zoom: true,
      graphEditing: false,
      groupActions: true,
      nodeDragging: true,
      selection: true,
      boxSelection: false,
      multiSelection: false,
      connection: true,
      clickToConnect: true,
      reconnection: true,
      routeEditing: true,
      keyboardNavigation: false,
      keyboardCommands: false,
      spaceToPan: true,
    },
    events: {
      isDeleteMode() {
        return getEffectiveToggleId(useUIStore.getState()) === 'delete_mode';
      },
      onSelectionChange(selection) {
        isApplyingCanvasSelection = true;
        try {
          reconcileAppSelection(selection);
        } finally {
          isApplyingCanvasSelection = false;
        }
      },
      onEdgeClick(edgeId, point) {
        const bounds = host.getBoundingClientRect();
        const pagePoint = { x: point.x + bounds.left, y: point.y + bounds.top };
        for (const listener of edgeClickListeners) listener(edgeId, pagePoint);
      },
      canConnectEndpoints(first, second) {
        const source = first.direction === 'output' ? first : second;
        const target = first.direction === 'input' ? first : second;
        if (source.direction !== 'output' || target.direction !== 'input') return false;
        const flowState = useFlowStore.getState();
        return isAppConnectionValid(
          {
            source: source.nodeId,
            sourceHandle: source.portId,
            target: target.nodeId,
            targetHandle: target.portId,
          },
          { nodes: flowState.nodes, edges: flowState.edges },
        );
      },
      onActionRequest(proposal: CanvasActionProposal): CanvasActionDecision {
        const flowState = useFlowStore.getState();
        const tutorialActive = isTutorialActive();
        const tutorialEvent = tutorialActive
          ? tutorialActionForCanvasProposal(proposal, flowState)
          : null;
        let edgeReconnectSelectionEvent: TutorialActionEvent | null = null;
        if (
          tutorialActive &&
          proposal.type === 'activate-canvas-target' &&
          proposal.target.type === 'edge'
        ) {
          const selectedEdgeId = getRealEdgeId(proposal.target.edgeId);
          const edge = flowState.edges.find((item) => item.id === selectedEdgeId);
          const endpoints = edge && getTutorialEdgeEndpoints(edge);
          if (endpoints) {
            edgeReconnectSelectionEvent = { type: 'edge-reconnect-start', ...endpoints };
          }
        }
        const requiresTutorialAuthorization = isPixiTutorialAuthorizationRequired(
          proposal,
          getEffectiveToggleId(useUIStore.getState()),
        );
        if (
          tutorialActive &&
          requiresTutorialAuthorization &&
          !(tutorialEvent && canPerformTutorialAction(tutorialEvent)) &&
          !(edgeReconnectSelectionEvent && canPerformTutorialAction(edgeReconnectSelectionEvent))
        ) {
          return {
            status: 'cancelled',
            reason: 'The current tutorial step does not authorize this action.',
          };
        }
        if (proposal.type === 'start-reconnect') return { status: 'ignored' };
        if (proposal.type === 'activate-canvas-target') {
          if (tutorialActive) {
            const mode = getEffectiveToggleId(useUIStore.getState());
            if (
              (proposal.target.type === 'node' || proposal.target.type === 'port') &&
              (mode === 'target' || mode === 'multi_select')
            ) {
              return applyPixiCanvasModeAction(proposal.target);
            }
            return { status: 'ignored' };
          }
          return applyPixiCanvasModeAction(proposal.target);
        }
        if (proposal.type === 'activate-control') return { status: 'ignored' };
        if (proposal.type === 'set-group-collapsed') {
          const group = flowState.nodesMap.get(proposal.groupId);
          if (!isGroupNode(group)) {
            return { status: 'rejected', reason: 'The group no longer exists.' };
          }
          if (group.data.collapsed === proposal.collapsed) return { status: 'unchanged' };
          if (proposal.collapsed) flowState.collapseGroup(group.id);
          else flowState.expandGroup(group.id);
          const updated = useFlowStore.getState().nodesMap.get(group.id);
          if (!isGroupNode(updated) || updated.data.collapsed !== proposal.collapsed) {
            return { status: 'rejected', reason: 'The app rejected the group action.' };
          }
          if (tutorialActive && tutorialEvent && shouldPixiProposalAdvanceTutorial(proposal)) {
            completeTutorialAction(tutorialEvent);
          }
          return { status: 'committed', id: group.id };
        }
        if (proposal.type === 'delete-edge-route-point') {
          if (getEffectiveToggleId(useUIStore.getState()) !== 'delete_mode' && !proposal.altKey) {
            return { status: 'ignored' };
          }
          const edgeId = getRealEdgeId(proposal.edgeId);
          const edge = flowState.edges.find((item) => item.id === edgeId);
          if (!edge) return { status: 'rejected', reason: 'The route edge no longer exists.' };
          const committed = flowState.setEdgeRoutePoints(edge.id, proposal.key, proposal.points);
          if (
            committed &&
            tutorialActive &&
            tutorialEvent &&
            shouldPixiProposalAdvanceTutorial(proposal)
          ) {
            completeTutorialAction(tutorialEvent);
          }
          return committed
            ? { status: 'committed', id: edge.id }
            : { status: 'unchanged', id: edge.id };
        }
        if (proposal.type === 'move-nodes') {
          const targets = new Map<string, { x: number; y: number }>();
          for (const position of proposal.positions) {
            if (
              !flowState.nodesMap.has(position.id) ||
              !Number.isFinite(position.x) ||
              !Number.isFinite(position.y) ||
              targets.has(position.id)
            ) {
              return { status: 'rejected', reason: 'The move contains an invalid node position.' };
            }
            targets.set(position.id, { x: position.x, y: position.y });
          }
          if (proposal.groupId) {
            const group = flowState.nodesMap.get(proposal.groupId);
            if (isGroupNode(group) && group.data.collapsed) {
              const memberIds = flowState.groupMemberIds[group.id] ?? [];
              const firstMemberId = memberIds[0];
              const firstMember = firstMemberId ? flowState.nodesMap.get(firstMemberId) : undefined;
              const firstTarget = firstMemberId ? targets.get(firstMemberId) : undefined;
              if (!firstMember || !isRecipeNode(firstMember) || !firstTarget) {
                return { status: 'rejected', reason: 'The collapsed group move is incomplete.' };
              }
              const delta = {
                x: firstTarget.x - firstMember.position.x,
                y: firstTarget.y - firstMember.position.y,
              };
              if (
                memberIds.some((memberId) => {
                  const member = flowState.nodesMap.get(memberId);
                  const target = targets.get(memberId);
                  return (
                    !isRecipeNode(member) ||
                    !target ||
                    target.x - member.position.x !== delta.x ||
                    target.y - member.position.y !== delta.y
                  );
                })
              ) {
                return {
                  status: 'rejected',
                  reason: 'Collapsed group members must move together.',
                };
              }
              targets.set(group.id, {
                x: group.position.x + delta.x,
                y: group.position.y + delta.y,
              });
            }
          }
          const nodeIds = [...targets.keys()];
          if (nodeIds.length === 0) {
            return { status: 'rejected', reason: 'The move does not contain any nodes.' };
          }
          const didMove = nodeIds.some((id) => {
            const node = flowState.nodesMap.get(id);
            const next = targets.get(id);
            return !!node && !!next && (node.position.x !== next.x || node.position.y !== next.y);
          });
          if (!didMove) return { status: 'unchanged' };
          flowState.captureDragStart(nodeIds, proposal.groupId);
          flowState.moveNodesToPositions(targets);
          flowState.commitDragStop(nodeIds);
          return { status: 'committed' };
        }

        if (proposal.type === 'reconnect') {
          const edgeId = getRealEdgeId(proposal.edgeId);
          const endpoint = toVisibleConnectionEndpoint(
            proposal.endpoint.nodeId,
            proposal.endpoint.portId,
            flowState,
          );
          const result = flowState.reconnectEdgeEndpoint(
            edgeId,
            proposal.side,
            endpoint.nodeId,
            endpoint.portId,
          );
          if (result.status === 'reconnected') {
            if (tutorialActive && tutorialEvent && shouldPixiProposalAdvanceTutorial(proposal)) {
              completeTutorialAction(tutorialEvent);
            }
            return { status: 'committed', id: edgeId };
          }
          if (result.status === 'unchanged') return { status: 'unchanged', id: edgeId };
          return { status: 'rejected', reason: result.reason };
        }

        if (proposal.type === 'set-edge-route') {
          const edgeId = getRealEdgeId(proposal.edgeId);
          if (!flowState.edges.some((edge) => edge.id === edgeId)) {
            return { status: 'rejected', reason: 'The route edge no longer exists.' };
          }
          const committed = flowState.setEdgeRoutePoints(edgeId, proposal.key, proposal.points);
          if (!committed)
            return { status: 'rejected', reason: 'The app rejected the route change.' };
          if (tutorialActive && tutorialEvent && shouldPixiProposalAdvanceTutorial(proposal)) {
            completeTutorialAction(tutorialEvent);
          }
          return { status: 'committed', id: edgeId };
        }

        const source = proposal.first.direction === 'output' ? proposal.first : proposal.second;
        const target = proposal.first.direction === 'input' ? proposal.first : proposal.second;
        const visibleSource = toVisibleConnectionEndpoint(source.nodeId, source.portId, flowState);
        const visibleTarget = toVisibleConnectionEndpoint(target.nodeId, target.portId, flowState);
        const connection = {
          source: visibleSource.nodeId,
          sourceHandle: visibleSource.portId,
          target: visibleTarget.nodeId,
          targetHandle: visibleTarget.portId,
        };
        const resolved = resolveAppConnection(connection, flowState.nodes);
        if (
          !resolved ||
          !isAppConnectionValid(connection, {
            nodes: flowState.nodes,
            edges: flowState.edges,
          })
        ) {
          return {
            status: 'rejected',
            reason: 'The recipe products or item/fluid types are incompatible.',
          };
        }
        const existing = flowState.edges.find(
          (edge) =>
            !edge.id.startsWith('proxy-') &&
            edge.source === resolved.sourceNodeId &&
            edge.sourceHandle === resolved.sourceHandleId &&
            edge.target === resolved.targetNodeId &&
            edge.targetHandle === resolved.targetHandleId,
        );
        if (existing) return { status: 'unchanged', id: existing.id };
        flowState.onConnect(connection);
        const committed = useFlowStore
          .getState()
          .edges.find(
            (edge) =>
              !edge.id.startsWith('proxy-') &&
              edge.source === resolved.sourceNodeId &&
              edge.sourceHandle === resolved.sourceHandleId &&
              edge.target === resolved.targetNodeId &&
              edge.targetHandle === resolved.targetHandleId,
          );
        if (!committed) return { status: 'rejected', reason: 'The app rejected the connection.' };
        if (tutorialActive && tutorialEvent && shouldPixiProposalAdvanceTutorial(proposal)) {
          completeTutorialAction(tutorialEvent);
        }
        return { status: 'committed', id: committed.id };
      },
      onNodeControl(nodeId, _controlId, action) {
        if (action !== 'node-menu') return;
        if (isTutorialActive() && !canPerformTutorialAction({ type: 'node-editor-open', nodeId })) {
          return;
        }
        if (!isTutorialActive() && getEffectiveToggleId(useUIStore.getState()) === 'delete_mode') {
          useFlowStore.getState().deleteNode(nodeId);
          return;
        }
        useUIStore.getState().setNodeEditorOpenId(nodeId);
        if (isTutorialActive() && useUIStore.getState().nodeEditorOpenId === nodeId) {
          completeTutorialAction({ type: 'node-editor-open', nodeId });
        }
      },
      onGroupInteraction(groupId, action) {
        if (action !== 'group-menu') return;
        if (
          isTutorialActive() &&
          !canPerformTutorialAction({ type: 'node-editor-open', nodeId: groupId })
        ) {
          return;
        }
        const group = useFlowStore.getState().nodesMap.get(groupId);
        if (!isGroupNode(group)) return;
        useUIStore.getState().setNodeEditorOpenId(groupId);
        if (isTutorialActive() && useUIStore.getState().nodeEditorOpenId === groupId) {
          completeTutorialAction({ type: 'node-editor-open', nodeId: groupId });
        }
      },
      onPortActivate(nodeId, portId) {
        activatePixiPortRow(nodeId, portId);
      },
      onPortDoubleActivate(nodeId, portId) {
        if (getEffectiveToggleId(useUIStore.getState())) return;
        const parsed = parseHandleId(portId);
        if (!parsed || parsed.nodeId !== nodeId) return;
        const tutorialEvent = {
          type: 'node-handle-double' as const,
          nodeId,
          side: parsed.side,
          index: parsed.index,
        };
        if (isTutorialActive() && !canPerformTutorialAction(tutorialEvent)) return;
        const applied = applyConnectedPortRate(nodeId, { side: parsed.side, index: parsed.index });
        if (applied && isTutorialActive()) completeTutorialAction(tutorialEvent);
      },
    },
    resolveGroupPresentationData: (group) => resolveGroupPresentationData(group.id),
  });
  reconcileCanvasSelection(editor, currentFlow);
  let isDestroyed = false;
  let didReportFailure = false;

  const fail = (error: unknown) => {
    if (didReportFailure || isDestroyed) return;
    didReportFailure = true;
    onUnavailable(error);
  };

  const surfaceRegistration = registerCanvasAdapter(
    createSurfaceApi(editor, host, camera, edgeClickListeners),
  );
  const refreshProjection = () => {
    try {
      const flowState = useFlowStore.getState();
      const projection = projectCurrentFlow(
        flowState,
        useEdgeThemeStore.getState(),
        presentationCache,
        activeRecipeCache,
        themeVersion,
        currentProjection,
      );
      currentProjection = projection;
      graph.replaceGraph(projection.graph);
      editor.refreshGroupPresentation();
      reconcileCanvasSelection(editor, flowState);
    } catch (error) {
      fail(error);
    }
  };

  const unsubscribeFlow = useFlowStore.subscribe((state, previousState) => {
    if (
      state.nodes === previousState.nodes &&
      state.edges === previousState.edges &&
      state.groupMemberIds === previousState.groupMemberIds
    ) {
      return;
    }
    // Pixi has already applied canvas selection; rebuilding its full projection here is redundant.
    if (isApplyingCanvasSelection) return;
    try {
      const projection = projectCurrentFlow(
        state,
        useEdgeThemeStore.getState(),
        presentationCache,
        activeRecipeCache,
        themeVersion,
        currentProjection,
      );
      currentProjection = projection;
      graph.replaceGraph(projection.graph);
      editor.refreshGroupPresentation();
      reconcileCanvasSelection(editor, state);
    } catch (error) {
      fail(error);
    }
  });

  const unsubscribeEdgeStyle = useEdgeThemeStore.subscribe((state, previousState) => {
    if (
      state.lineStyle === previousState.lineStyle &&
      state.pathStyle === previousState.pathStyle &&
      state.animationStyle === previousState.animationStyle
    ) {
      return;
    }
    try {
      const flowState = useFlowStore.getState();
      const projection = projectCurrentFlow(
        flowState,
        state,
        presentationCache,
        activeRecipeCache,
        themeVersion,
        currentProjection,
      );
      currentProjection = projection;
      graph.replaceGraph(projection.graph);
    } catch (error) {
      fail(error);
    }
  });

  const unsubscribeUI = useUIStore.subscribe((state, previousState) => {
    if (state.rateMode !== previousState.rateMode) refreshProjection();
  });

  const unsubscribeResults = useFlowResultStore.subscribe((state, previousState) => {
    if (
      state.results !== previousState.results ||
      state.resolvedProducts !== previousState.resolvedProducts ||
      state.nodeRecipes !== previousState.nodeRecipes ||
      state.graphVersion !== previousState.graphVersion ||
      state.dataDbVersion !== previousState.dataDbVersion
    ) {
      refreshProjection();
    }
  });

  const unsubscribeData = useDataStore.subscribe((state, previousState) => {
    if (state.dbVersion !== previousState.dbVersion) refreshProjection();
  });

  const unsubscribeGlobalSettings = useGlobalSettingsStore.subscribe((state, previousState) => {
    if (state.settings !== previousState.settings) refreshProjection();
  });

  const themeObserver = new MutationObserver(() => {
    themeVersion += 1;
    refreshProjection();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
  });

  if (!initialViewport) editor.fitGraph();

  return {
    editor,
    camera,
    fitGraph: () => editor.fitGraph(),
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      unsubscribeFlow();
      unsubscribeEdgeStyle();
      unsubscribeUI();
      unsubscribeResults();
      unsubscribeData();
      unsubscribeGlobalSettings();
      themeObserver.disconnect();
      surfaceRegistration();
      editor.destroy();
    },
  };
}
