import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import 'fake-indexeddb/auto';
import { createServer } from 'vite';

const viteServer = await createServer({
  configFile: false,
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: 'custom',
});
const lookup = await viteServer.ssrLoadModule('/src/data/lookup.ts');
await lookup.initializeDatabase();
const { projectAppGraphToPixiV1 } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiGraphProjection.ts',
);
const { createPixiRecipePresentation, createPixiRecipePresentationCache } =
  await viteServer.ssrLoadModule('/src/canvas/pixiRecipePresentation.ts');
const { createPixiActiveRecipeCache } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiActiveRecipeCache.ts',
);
const { GraphStore } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/state/graph-store.ts',
);
const { getGroupProxyPorts } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/domain/nodes/group/geometry.ts',
);
const { useFlowStore } = await viteServer.ssrLoadModule('/src/stores/useFlowStore.ts');
const { getEffectiveToggleId, useUIStore } = await viteServer.ssrLoadModule(
  '/src/stores/useUIStore.ts',
);
const { activatePixiPortRow } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiPortRowActivation.ts',
);
const { useTutorialStore } = await viteServer.ssrLoadModule('/src/stores/useTutorialStore.ts');
const { useFlowResultStore } = await viteServer.ssrLoadModule('/src/stores/useFlowResultStore.ts');
const { useEdgeThemeStore } = await viteServer.ssrLoadModule('/src/stores/useEdgeThemeStore.ts');
const idGenerator = await viteServer.ssrLoadModule('/src/utils/idGenerator.ts');
const transformer = await viteServer.ssrLoadModule('/src/persistence/transformer.ts');
const { applyPixiCanvasModeAction } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiCanvasModeAction.ts',
);
const { applyConnectedPortRate } = await viteServer.ssrLoadModule('/src/canvas/portRateAction.ts');
const { resolvePixiTutorialGeometry } = await viteServer.ssrLoadModule(
  '/src/components/tutorial/tutorialHighlightUtils.ts',
);
const { getOffscreenTutorialAnchor } = await viteServer.ssrLoadModule(
  '/src/components/tutorial/tutorialHighlightUtils.ts',
);
const { areConnectionProductsCompatible, isAppConnectionValid } = await viteServer.ssrLoadModule(
  '/src/canvas/connectionValidation.ts',
);
const { findBestProductMatchIndex, isPotentialHandleTypeMatch, isProductEntryMatch } =
  await viteServer.ssrLoadModule('/src/components/overlays/RecipeSelector/productMatch.ts');
const { computeRecipeInsertion } = await viteServer.ssrLoadModule(
  '/src/components/overlays/RecipeSelector/graphInsertion.ts',
);
const { ConnectionDraft, findNearestConnectablePort } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/interaction/connection-draft.ts',
);
const { createCanvasTapActivation } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/interaction/canvas-tap-activation.ts',
);
const { findNearestPortHit, getPortHitRadius } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/interaction/port-hit-testing.ts',
);
const { GROUP_TUTORIAL_STEPS } = await viteServer.ssrLoadModule('/src/tutorials/groupsTutorial.ts');
const { getTutorialDefinition } = await viteServer.ssrLoadModule('/src/tutorials/registry.ts');
const { isPixiTutorialAuthorizationRequired, shouldPixiProposalAdvanceTutorial } =
  await viteServer.ssrLoadModule('/src/canvas/pixiTutorialGesturePolicy.ts');
const {
  createCanvasExportFrame,
  createCanvasExportTiles,
  MAX_CANVAS_EXPORT_PIXELS,
  unionCanvasExportBounds,
} = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/renderer/canvas-export-bounds.ts',
);
const { drawCanvasExportTile } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/renderer/canvas-export-readback.ts',
);
const {
  getCanvasNodeCenter,
  getViewportCenteredOnGraphPoint,
  hasPixiCanvasPngExporter,
  registerCanvasAdapter,
  setPendingCanvasViewState,
} = await viteServer.ssrLoadModule('/src/canvas/canvasAdapterApi.ts');
const { createNodeGeometry } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/renderer/nodes/recipe.ts',
);
const { createSelectedNodeGeometry } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/renderer/nodes/recipe.ts',
);
const { initializeProjectedEdgeBounds } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/renderer/flowchart-renderer.ts',
);
const { createNodeView, setNodeDetailLevel } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/renderer/node-view.ts',
);
const { createNodeTextRefreshQueue } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/renderer/node-text-queue.ts',
);
const { getNodeTextVisibility } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/renderer/node-view.ts',
);
const { shouldHandleDeleteTargetBeforeCanvasAction, shouldResolveDeleteAtPoint } =
  await viteServer.ssrLoadModule('/src/canvas/pixiEngine/canvas/interaction/graph-deletion.ts');
const { calculateDragPositions } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/interaction/node-drag.ts',
);
const { shouldRebuildProjectedPlanForSelection } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEngine/canvas/interaction/selection-controller.ts',
);
const { getPixiPopupEdgeIds, getPixiPopupAnchor } = await viteServer.ssrLoadModule(
  '/src/canvas/pixiEdgeInfoPopupGeometry.ts',
);

after(async () => {
  await viteServer.close();
});

beforeEach(() => {
  useFlowStore.getState().setNodesAndEdges([], [], {
    recordHistory: false,
    resetHistory: true,
  });
  useEdgeThemeStore.getState().resetEdgeStyles();
  useUIStore.setState({
    activeToggleId: null,
    temporaryOverrides: [],
    isRecipeSelectorOpen: false,
    isSavesOverlayOpen: false,
    isDataOverlayOpen: false,
    isThemeOverlayOpen: false,
    isResearchOverlayOpen: false,
    isHelpOverlayOpen: false,
    isLPSolverOpen: false,
    nodeEditorOpenId: null,
  });
  useTutorialStore.setState({ activeTutorialId: null });
});

test('group drags snap one shared delta so collapsed members remain aligned', () => {
  const starts = new Map([
    ['member-a', { x: 0, y: 40 }],
    ['member-b', { x: 300, y: 100 }],
  ]);

  const positions = calculateDragPositions(starts, 151, 20, true);

  assert.deepEqual(positions.get('member-a'), { x: 152, y: 66 });
  assert.deepEqual(positions.get('member-b'), { x: 452, y: 126 });
  assert.equal(positions.get('member-a').x - starts.get('member-a').x, 152);
  assert.equal(positions.get('member-b').x - starts.get('member-b').x, 152);
  assert.equal(positions.get('member-a').y - starts.get('member-a').y, 26);
  assert.equal(positions.get('member-b').y - starts.get('member-b').y, 26);
});

function groupNode() {
  return {
    id: 'group-1',
    type: 'group',
    position: { x: 0, y: 0 },
    data: {
      label: 'Production group',
      collapsed: false,
      handlesReady: false,
      inputProxyHandleIds: [],
      outputProxyHandleIds: [],
    },
  };
}

function recipeNode(id, recipeId, groupId, x) {
  const recipe = lookup.resolveActiveRecipe(recipeId);
  assert.ok(recipe, `expected recipe ${recipeId}`);
  return {
    id,
    type: 'recipe',
    position: { x, y: 40 },
    data: {
      recipeId,
      machineCount: 1,
      settings: { customSetting: { enabled: true } },
      inputOrder: recipe.inputs.map((_, index) => index),
      outputOrder: recipe.outputs.map((_, index) => index),
      ...(groupId ? { groupId } : {}),
    },
  };
}

function edge(id, source, target, data = {}) {
  return {
    id,
    source,
    sourceHandle: idGenerator.buildHandleId(source, 'output', 0),
    target,
    targetHandle: idGenerator.buildHandleId(target, 'input', 0),
    data,
  };
}

function setGraph({ collapsed = false } = {}) {
  const nodes = [
    groupNode(),
    recipeNode('source', 'r_item_spawner_01', 'group-1', 40),
    recipeNode('inside-target', 'r_paper_mill_01', 'group-1', 280),
    recipeNode('outside-target', 'r_paper_mill_01', undefined, 620),
  ];
  const route = {
    controlPoints: [{ x: 100, y: 120 }],
    orthogonalTurns: [{ x: 140, y: 180 }],
    routeLabel: 'route metadata',
    custom: { owner: 'app' },
  };
  const edges = [
    edge('internal-edge', 'source', 'inside-target', structuredClone(route)),
    edge('boundary-edge', 'source', 'outside-target', structuredClone(route)),
    edge('self-loop', 'inside-target', 'inside-target', structuredClone(route)),
  ];
  useFlowStore.getState().setNodesAndEdges(nodes, edges, {
    recordHistory: false,
    resetHistory: true,
  });
  if (collapsed) {
    useFlowStore.getState().collapseGroup('group-1');
    useFlowStore
      .getState()
      .updateGroupNodeData('group-1', { handlesReady: true }, { recordHistory: false });
    useFlowStore.getState().clearHistory();
  }
}

function projection(
  edgeStyle = {
    lineStyle: 'dashed',
    pathStyle: 'orthogonal',
    animationStyle: 'moving-dashes',
  },
) {
  const state = useFlowStore.getState();
  return projectAppGraphToPixiV1({
    nodes: state.nodes,
    edges: state.edges,
    groupMemberIds: state.groupMemberIds,
    edgeStyle,
  });
}

test('v1 projection preserves app IDs, port order, app data, routes, groups, and shared edge style', () => {
  setGraph({ collapsed: true });
  const beforeStore = useFlowStore.getState();
  const beforeNodes = beforeStore.nodes;
  const beforeEdges = beforeStore.edges;
  const beforeHistory = beforeStore.historyPast;
  const beforeSolutionVersion = beforeStore.solutionVersion;
  const beforeGraphVersion = beforeStore.graphVersion;
  const beforeResults = useFlowResultStore.getState();
  const saveBefore = transformer.serializeCanvas(beforeNodes, beforeEdges);

  const result = projection({
    lineStyle: 'dotted',
    pathStyle: 'bezier',
    animationStyle: 'pulse-arrow',
  });
  const { graph } = result;

  assert.equal(result.adapterVersion, 1);
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ['source', 'inside-target', 'outside-target'],
  );
  assert.deepEqual(
    graph.edges.map((item) => item.id),
    ['internal-edge', 'boundary-edge', 'self-loop'],
  );
  assert.ok(graph.edges.every((item) => !item.id.startsWith('proxy-')));
  assert.deepEqual(graph.nodes[0].inputOrder, []);
  assert.deepEqual(graph.nodes[0].outputOrder, ['source-output-0']);
  assert.deepEqual(graph.nodes[0].data.appData.settings, { customSetting: { enabled: true } });
  assert.deepEqual(
    graph.edges[1].controlPoints?.map(({ x, y }) => ({ x, y })),
    [{ x: 100, y: 120 }],
  );
  assert.deepEqual(
    graph.edges[1].orthogonalTurns?.map(({ x, y }) => ({ x, y })),
    [{ x: 140, y: 180 }],
  );
  assert.equal(graph.edges[1].appData.routeLabel, 'route metadata');
  assert.deepEqual(
    graph.edges.map((item) => item.settings),
    graph.edges.map(() => ({
      routingStyle: 'bezier',
      lineStyle: 'dotted',
      animationStyle: 'pulse-arrow',
    })),
  );
  assert.deepEqual(graph.groups, [
    {
      id: 'group-1',
      label: 'Production group',
      memberNodeIds: ['source', 'inside-target'],
      collapsed: true,
      inputProxyPortIds: [],
      outputProxyPortIds: ['source-output-0'],
    },
  ]);

  const groupedNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const boundaryPorts = getGroupProxyPorts(graph.groups[0], groupedNodeById, graph.edges);
  assert.equal(boundaryPorts.length, 1);
  assert.equal(boundaryPorts[0].memberNodeId, 'source');
  assert.equal(boundaryPorts[0].direction, 'output');
  assert.equal(boundaryPorts[0].memberPortId, 'source-output-0');

  assert.equal(useFlowStore.getState().nodes, beforeNodes);
  assert.equal(useFlowStore.getState().edges, beforeEdges);
  assert.equal(useFlowStore.getState().historyPast, beforeHistory);
  assert.equal(useFlowStore.getState().solutionVersion, beforeSolutionVersion);
  assert.equal(useFlowStore.getState().graphVersion, beforeGraphVersion);
  assert.equal(useFlowResultStore.getState(), beforeResults);
  assert.deepEqual(
    transformer.serializeCanvas(useFlowStore.getState().nodes, useFlowStore.getState().edges),
    saveBefore,
  );
  assert.equal(transformer.CURRENT_SAVE_VERSION, 4);
});

test('collapsed group proxy ports remain after edge deletion and clear on expand-collapse', () => {
  setGraph({ collapsed: true });
  const flow = useFlowStore.getState();
  const sourcePort = idGenerator.buildHandleId('source', 'output', 0);
  const groupBefore = flow.nodesMap.get('group-1');
  assert.ok(groupBefore);
  assert.deepEqual(groupBefore.data.outputProxyHandleIds, [sourcePort]);

  flow.onEdgesChange([{ id: 'boundary-edge', type: 'remove' }]);
  assert.ok(!useFlowStore.getState().edges.some((edge) => edge.id === 'boundary-edge'));
  assert.deepEqual(useFlowStore.getState().nodesMap.get('group-1').data.outputProxyHandleIds, [
    sourcePort,
  ]);

  const graphBeforeExpand = projection().graph;
  const nodeByIdBeforeExpand = new Map(graphBeforeExpand.nodes.map((node) => [node.id, node]));
  assert.equal(
    getGroupProxyPorts(graphBeforeExpand.groups[0], nodeByIdBeforeExpand, graphBeforeExpand.edges)
      .length,
    1,
  );

  useFlowStore.getState().expandGroup('group-1');
  useFlowStore.getState().collapseGroup('group-1');
  const current = useFlowStore.getState();
  assert.deepEqual(current.nodesMap.get('group-1').data.outputProxyHandleIds, []);

  const graph = projection().graph;
  const groupedNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const proxyPorts = getGroupProxyPorts(graph.groups[0], groupedNodeById, graph.edges);
  assert.deepEqual(proxyPorts, []);
});

test('renderer adapter restores a pending graph-space center and zoom on registration', () => {
  const restored = [];
  const viewState = { center: { x: 123, y: -45 }, zoom: 0.8 };
  setPendingCanvasViewState(viewState);
  const unregister = registerCanvasAdapter({
    setViewState: (next) => restored.push(next),
  });

  assert.deepEqual(restored, [viewState]);
  unregister();
});

test('PNG export uses the adapter renderer only for Pixi and keeps React Flow on its DOM path', () => {
  assert.equal(
    hasPixiCanvasPngExporter({ canvasType: 'pixi', exportCanvasPng: async () => new Blob() }),
    true,
  );
  assert.equal(
    hasPixiCanvasPngExporter({
      canvasType: 'react-flow',
      exportCanvasPng: async () => new Blob(),
    }),
    false,
  );
  assert.equal(hasPixiCanvasPngExporter({ canvasType: 'pixi' }), false);
  assert.equal(hasPixiCanvasPngExporter(null), false);
});

test('canvas overlay actions are returned for post-click activation and reject pointer movement', () => {
  const activation = createCanvasTapActivation();
  let calls = 0;

  activation.begin({ x: 10, y: 20 }, () => calls++);
  assert.equal(calls, 0);
  const activate = activation.activate({ x: 14, y: 23 }, 1, 1);
  assert.equal(typeof activate, 'function');
  assert.equal(calls, 0);
  activate();
  assert.equal(calls, 1);

  activation.begin({ x: 10, y: 20 }, () => calls++);
  assert.equal(activation.activate({ x: 15, y: 20 }, 2, 1), false);
  assert.equal(calls, 1);
  assert.equal(activation.activate({ x: 10, y: 20 }, 1, 1), false);
});

test('touch port hit targets stay 44 CSS pixels across zoom and nearest handle wins overlap', () => {
  assert.equal(getPortHitRadius('touch', 1, 1, 12), 22);
  assert.equal(getPortHitRadius('touch', 1, 0.5, 12), 44);
  assert.equal(getPortHitRadius('touch', 2, 2, 12), 22);
  assert.equal(getPortHitRadius('mouse', 1, 1, 12), 6);

  const nearest = findNearestPortHit(
    [
      { id: 'input-a', x: 0, y: 0 },
      { id: 'input-b', x: 0, y: 30 },
    ],
    { x: 0, y: 17 },
    22,
    22,
    1,
    1,
    1,
  );
  assert.equal(nearest?.id, 'input-b');
});

test('PNG export waits for tile readback before compositing', async () => {
  let finishReadback;
  const draws = [];
  const context = {
    drawImage(...args) {
      draws.push(args);
    },
  };
  const tileCanvas = { id: 'tile' };
  const tile = { x: 2, y: 3, width: 40, height: 50 };

  const drawing = drawCanvasExportTile(
    context,
    tileCanvas,
    tile,
    () => new Promise((resolve) => (finishReadback = resolve)),
  );
  await Promise.resolve();
  assert.deepEqual(draws, []);

  finishReadback();
  await drawing;
  assert.deepEqual(draws, [[tileCanvas, 2, 3, 40, 50]]);
});

test('Pixi edge popup anchors near the click and resolves proxy edges to real app edges', () => {
  assert.deepEqual(getPixiPopupEdgeIds('proxy-real-edge'), {
    edgeId: 'real-edge',
    geometryEdgeId: 'proxy-real-edge',
  });
  assert.deepEqual(getPixiPopupEdgeIds('real-edge'), {
    edgeId: 'real-edge',
    geometryEdgeId: 'real-edge',
  });
  assert.deepEqual(getPixiPopupAnchor({ x: 10, y: 30 }), { x: 24, y: 44 });
  assert.equal(getPixiPopupAnchor({ x: Number.NaN, y: 0 }), null);
});

test('edge selection skips projected scene reconstruction unless leaving a selected group', () => {
  assert.equal(shouldRebuildProjectedPlanForSelection(null, { type: 'edge' }), false);
  assert.equal(shouldRebuildProjectedPlanForSelection({ type: 'node' }, { type: 'edge' }), false);
  assert.equal(shouldRebuildProjectedPlanForSelection({ type: 'edge' }, { type: 'edge' }), false);
  assert.equal(shouldRebuildProjectedPlanForSelection({ type: 'group' }, { type: 'edge' }), true);
  assert.equal(shouldRebuildProjectedPlanForSelection({ type: 'edge' }, null), true);
});

test('recipe projection retains linked product ports for heat exchangers', () => {
  const node = recipeNode('heat-exchanger', 'r_heat_exchanger_01', undefined, 40);
  useFlowStore
    .getState()
    .setNodesAndEdges([node], [], { recordHistory: false, resetHistory: true });

  const projected = projection().graph.nodes[0];
  const linkedPorts = projected.ports.filter((port) => port.linkId === 'coolant');

  assert.ok(linkedPorts.some((port) => port.direction === 'input'));
  assert.ok(linkedPorts.some((port) => port.direction === 'output'));
});

test('selected recipe outline sits outside the node border as a distinct ring', () => {
  setGraph();
  const node = projection().graph.nodes[0];
  const geometry = createSelectedNodeGeometry({
    node,
    position: { x: node.x, y: node.y },
    order: 0,
  });
  const xCoordinates = Array.from(geometry.positions).filter((_, index) => index % 2 === 0);
  const yCoordinates = Array.from(geometry.positions).filter((_, index) => index % 2 === 1);

  assert.equal(Math.min(...xCoordinates), node.x - 3);
  assert.equal(Math.max(...xCoordinates), node.x + 380 + 3);
  assert.equal(Math.min(...yCoordinates), node.y - 3);
});

test('recipe node view paints linked ports, target badge, and temperature badge', () => {
  const node = recipeNode('heat-exchanger', 'r_heat_exchanger_01', undefined, 40);
  useFlowStore
    .getState()
    .setNodesAndEdges([node], [], { recordHistory: false, resetHistory: true });
  const projected = projection().graph.nodes[0];
  const view = createNodeView({
    ...projected,
    data: { ...projected.data, isTarget: true, temperature: '120°C' },
  });

  setNodeDetailLevel(view, 1);

  assert.equal(view.statusBadges.length, 2);
  assert.ok(view.textContainer.children.some((child) => child.constructor.name === 'Graphics'));
  view.container.destroy({ children: true });
});

test('node detail refreshes are deduplicated and processed in bounded frame batches', () => {
  const queue = createNodeTextRefreshQueue();
  const updated = [];
  queue.enqueue(['near', 'middle', 'middle', 'far']);

  assert.equal(
    queue.process(
      (id) => updated.push(id),
      3,
      () => 0,
      2,
    ),
    true,
  );
  assert.deepEqual(updated, ['near', 'middle']);
  assert.equal(queue.hasPending(), true);

  assert.equal(
    queue.process(
      (id) => updated.push(id),
      3,
      () => 0,
      2,
    ),
    false,
  );
  assert.deepEqual(updated, ['near', 'middle', 'far']);
  assert.equal(queue.hasPending(), false);
});

test('shared appearance is normalized onto every edge and invalid replacement is atomic', () => {
  setGraph();
  const state = useFlowStore.getState();
  for (const lineStyle of ['solid', 'dashed', 'dotted']) {
    for (const animationStyle of ['none', 'moving-dashes', 'pulse-arrow']) {
      const result = projectAppGraphToPixiV1({
        nodes: state.nodes,
        edges: state.edges,
        groupMemberIds: state.groupMemberIds,
        edgeStyle: { lineStyle, pathStyle: 'straight', animationStyle },
      });
      assert.ok(result.graph.edges.every((item) => item.settings.lineStyle === lineStyle));
      assert.ok(result.graph.edges.every((item) => item.settings.routingStyle === 'straight'));
      assert.ok(
        result.graph.edges.every((item) => item.settings.animationStyle === animationStyle),
      );
    }
  }

  const valid = projection();
  const mirror = new GraphStore(valid.graph);
  const graphBefore = structuredClone(mirror.toGraphState());
  const invalidEdge = {
    ...valid.graph.edges[0],
    id: 'invalid-route-edge',
    controlPoints: [{ id: 'bad-point', x: Number.NaN, y: 0 }],
  };
  assert.throws(() =>
    mirror.replaceGraph({ ...valid.graph, edges: [...valid.graph.edges, invalidEdge] }),
  );
  assert.deepEqual(mirror.toGraphState(), graphBefore);

  const invalidOrderNodes = state.nodes.map((node) =>
    node.id === 'source' ? { ...node, data: { ...node.data, inputOrder: [42] } } : node,
  );
  assert.throws(() =>
    projectAppGraphToPixiV1({
      nodes: invalidOrderNodes,
      edges: state.edges,
      groupMemberIds: state.groupMemberIds,
      edgeStyle: {
        lineStyle: 'dashed',
        pathStyle: 'orthogonal',
        animationStyle: 'moving-dashes',
      },
    }),
  );
  assert.equal(useFlowStore.getState().nodes, state.nodes);
  assert.equal(useFlowStore.getState().edges, state.edges);
});

test('graph snapshot replacement only notifies Pixi about changed entities', () => {
  setGraph();
  const snapshot = projection();
  const mirror = new GraphStore(snapshot.graph);
  const originalSource = mirror.getNode('source');
  const originalEdge = mirror.getEdge('boundary-edge');
  const graphBefore = structuredClone(mirror.toGraphState());
  const changes = [];
  mirror.subscribe((change) => changes.push(change));

  mirror.replaceGraph({
    ...snapshot.graph,
    nodes: snapshot.graph.nodes.map((node) => ({
      ...node,
      ports: node.ports.map((port) => ({ ...port })),
      inputOrder: [...node.inputOrder],
      outputOrder: [...node.outputOrder],
      data: { ...node.data },
    })),
    edges: snapshot.graph.edges.map((edge) => ({
      ...edge,
      settings: { ...edge.settings },
      ...(edge.controlPoints
        ? { controlPoints: edge.controlPoints.map((point) => ({ ...point })) }
        : {}),
      ...(edge.orthogonalTurns
        ? { orthogonalTurns: edge.orthogonalTurns.map((point) => ({ ...point })) }
        : {}),
    })),
    groups: snapshot.graph.groups.map((group) => ({
      ...group,
      memberNodeIds: [...group.memberNodeIds],
      inputProxyPortIds: [...(group.inputProxyPortIds ?? [])],
      outputProxyPortIds: [...(group.outputProxyPortIds ?? [])],
    })),
    edgeDefaults: { ...snapshot.graph.edgeDefaults },
  });

  assert.equal(changes.length, 0);
  assert.equal(mirror.getNode('source'), originalSource);
  assert.equal(mirror.getEdge('boundary-edge'), originalEdge);

  assert.throws(() =>
    mirror.replaceGraph({
      ...snapshot.graph,
      nodes: snapshot.graph.nodes.filter((node) => node.id !== 'source'),
    }),
  );
  assert.deepEqual(mirror.toGraphState(), graphBefore);
  assert.equal(changes.length, 0);

  mirror.replaceGraph({
    ...snapshot.graph,
    edges: snapshot.graph.edges.filter((edge) => edge.id !== 'boundary-edge'),
  });

  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].removedEdgeIds, ['boundary-edge']);
  assert.deepEqual(changes[0].changedNodeIds, []);
  assert.deepEqual(changes[0].changedEdgeIds, []);
  assert.equal(mirror.getNode('source'), originalSource);
  assert.equal(mirror.getEdge('boundary-edge'), undefined);
});

test('unchanged graph projection records are reused across an edge deletion', () => {
  setGraph();
  const state = useFlowStore.getState();
  const input = {
    nodes: state.nodes,
    edges: state.edges,
    groupMemberIds: state.groupMemberIds,
    edgeStyle: useEdgeThemeStore.getState(),
    activeRecipeByNodeId: new Map(
      state.nodes
        .filter((node) => node.type === 'recipe')
        .map((node) => [
          node.id,
          lookup.resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id),
        ]),
    ),
  };
  const initial = projectAppGraphToPixiV1(input);
  const next = projectAppGraphToPixiV1({ ...input, previousProjection: initial });
  assert.ok(next.graph.nodes.every((node, index) => node === initial.graph.nodes[index]));
  assert.ok(next.graph.edges.every((edge, index) => edge === initial.graph.edges[index]));
  assert.ok(next.graph.groups?.every((group, index) => group === initial.graph.groups?.[index]));

  const afterDeletion = projectAppGraphToPixiV1({
    ...input,
    edges: state.edges.filter((edge) => edge.id !== 'boundary-edge'),
    previousProjection: next,
  });
  assert.ok(afterDeletion.graph.nodes.every((node, index) => node === initial.graph.nodes[index]));
  assert.equal(afterDeletion.graph.edges.length, initial.graph.edges.length - 1);
  assert.ok(
    afterDeletion.graph.edges.every(
      (edge) => edge === initial.graph.edges.find((previous) => previous.id === edge.id),
    ),
  );

  const routeChangedEdges = state.edges.map((edge) =>
    edge.id === 'boundary-edge'
      ? { ...edge, data: { ...edge.data, controlPoints: [{ x: 300, y: 220 }] } }
      : edge,
  );
  const routeChanged = projectAppGraphToPixiV1({
    ...input,
    edges: routeChangedEdges,
    previousProjection: next,
  });
  assert.notEqual(
    routeChanged.graph.edges.find((edge) => edge.id === 'boundary-edge'),
    next.graph.edges.find((edge) => edge.id === 'boundary-edge'),
  );
  assert.equal(
    routeChanged.graph.edges.find((edge) => edge.id === 'internal-edge'),
    next.graph.edges.find((edge) => edge.id === 'internal-edge'),
  );
});

test('recipe presentation cache reuses unchanged state and invalidates changed inputs', () => {
  setGraph();
  const node = useFlowStore.getState().nodesMap.get('source');
  assert.ok(node?.type === 'recipe');
  const recipe = lookup.getRecipe(node.data.recipeId);
  assert.ok(recipe);
  const input = {
    node,
    recipe,
    rateMode: 'minute',
    isSolveFresh: false,
    resolvedProducts: {},
  };
  const cache = createPixiRecipePresentationCache();
  const versions = { dataDbVersion: 1, themeVersion: 1 };
  const first = cache.get(input, versions);
  assert.equal(cache.get(input, versions), first);
  assert.notEqual(cache.get({ ...input, rateMode: 'second' }, versions), first);
  assert.notEqual(cache.get(input, { ...versions, dataDbVersion: 2 }), first);
  assert.notEqual(cache.get(input, { ...versions, themeVersion: 2 }), first);
  assert.notEqual(
    cache.get({ ...input, node: { ...node, data: { ...node.data, machineCount: 2 } } }, versions),
    first,
  );
  const freshInput = {
    ...input,
    isSolveFresh: true,
    flowResult: { inputFlows: [], outputFlows: [] },
  };
  const fresh = cache.get(freshInput, versions);
  assert.notEqual(
    cache.get(
      {
        ...freshInput,
        resolvedProducts: { [idGenerator.buildHandleId(node.id, 'output', 0)]: 'changed-product' },
      },
      versions,
    ),
    fresh,
  );
});

test('special recipe cache reuses results until accessed graph dependencies change', () => {
  setGraph();
  const node = useFlowStore.getState().nodesMap.get('source');
  assert.ok(node?.type === 'recipe');
  const cache = createPixiActiveRecipeCache();
  const globalSettings = {};
  let resolvedProduct = 'p_oak_log';
  let computeCount = 0;
  const input = {
    node,
    globalSettings,
    dataDbVersion: 1,
    createHelpers: () => ({
      resolveProduct: () => resolvedProduct,
      hasConnection: () => true,
      getFlowRate: () => 10,
    }),
  };
  const resolve = (helpers) => {
    computeCount += 1;
    const recipe = lookup.getRecipe(node.data.recipeId);
    assert.ok(recipe);
    return {
      ...recipe,
      outputs: [{ ...recipe.outputs[0], product_id: helpers.resolveProduct('output', 0) }],
    };
  };

  const first = cache.get(input, resolve);
  assert.ok(first);
  assert.equal(cache.get(input, resolve), first);
  assert.equal(computeCount, 1);

  resolvedProduct = 'p_birch_log';
  const changedDependency = cache.get(input, resolve);
  assert.ok(changedDependency);
  assert.notEqual(changedDependency, first);
  assert.equal(changedDependency.outputs[0].product_id, 'p_birch_log');
  assert.equal(computeCount, 2);
});

test('recipe projection includes app-computed statistics, port summaries, and solver handle states', () => {
  setGraph();
  const flowState = useFlowStore.getState();
  const node = flowState.nodesMap.get('source');
  assert.ok(node?.type === 'recipe');
  const recipe = lookup.resolveActiveRecipe(node.data.recipeId, node.data.settings, node.id);
  assert.ok(recipe);
  const presentation = createPixiRecipePresentation({
    node,
    recipe,
    rateMode: 'minute',
    isSolveFresh: false,
    resolvedProducts: {},
  });
  const projected = projectAppGraphToPixiV1({
    nodes: flowState.nodes,
    edges: flowState.edges,
    groupMemberIds: flowState.groupMemberIds,
    edgeStyle: useEdgeThemeStore.getState(),
    recipePresentationByNodeId: new Map([[node.id, presentation]]),
  });
  const projectedNode = projected.graph.nodes.find((item) => item.id === node.id);
  assert.ok(projectedNode);
  assert.notEqual(projectedNode.data.cycleTime, '—');
  assert.notEqual(projectedNode.data.power, '—');
  assert.notEqual(projectedNode.data.pollution, '—');
  assert.equal(projectedNode.data.machineName, presentation.machineName);
  assert.ok(projectedNode.ports.every((port) => typeof port.summary === 'string'));
  assert.ok(projectedNode.ports.every((port) => port.summary?.includes('x')));

  const targetNode = flowState.nodesMap.get('inside-target');
  assert.ok(targetNode?.type === 'recipe');
  const targetRecipe = lookup.resolveActiveRecipe(
    targetNode.data.recipeId,
    targetNode.data.settings,
    targetNode.id,
  );
  assert.ok(targetRecipe?.inputs.length);
  assert.ok(targetRecipe.outputs.length);
  const inputStatuses = targetRecipe.inputs.map(() => ({ hasDeficiency: false, connected: 0 }));
  const outputStatuses = targetRecipe.outputs.map(() => ({ hasExcess: false, connected: 0 }));
  inputStatuses[0].hasDeficiency = true;
  outputStatuses[0].hasExcess = true;
  const targetPresentation = createPixiRecipePresentation({
    node: targetNode,
    recipe: targetRecipe,
    rateMode: 'minute',
    flowResult: { inputFlows: inputStatuses, outputFlows: outputStatuses },
    isSolveFresh: true,
    resolvedProducts: {},
  });
  const heatedPresentation = createPixiRecipePresentation({
    node: targetNode,
    recipe: {
      ...targetRecipe,
      runtime: { ...targetRecipe.runtime, hxTemp: 120 },
    },
    rateMode: 'minute',
    isSolveFresh: true,
    resolvedProducts: {},
  });
  assert.ok(heatedPresentation.temperature?.includes('120'));
  const statusProjection = projectAppGraphToPixiV1({
    nodes: flowState.nodes,
    edges: flowState.edges,
    groupMemberIds: flowState.groupMemberIds,
    edgeStyle: useEdgeThemeStore.getState(),
    recipePresentationByNodeId: new Map([[targetNode.id, targetPresentation]]),
  });
  const statusNode = statusProjection.graph.nodes.find((item) => item.id === targetNode.id);
  assert.ok(statusNode);
  assert.equal(statusNode?.ports.find((port) => port.direction === 'input')?.status, 'deficient');
  assert.equal(statusNode?.ports.find((port) => port.direction === 'output')?.status, 'excess');
  const statusGeometry = createNodeGeometry(statusNode, { x: statusNode.x, y: statusNode.y });
  assert.ok(statusGeometry.uvs.includes(15.5 / 256));
  assert.ok(statusGeometry.uvs.includes(16.5 / 256));
  const statusFillIndex = statusGeometry.uvs.findIndex(
    (value, index) => index % 2 === 0 && (value === 15.5 / 256 || value === 16.5 / 256),
  );
  const borderIndex = statusGeometry.uvs.findIndex(
    (value, index) => index % 2 === 0 && value === 9.5 / 256,
  );
  assert.ok(statusFillIndex >= 0);
  assert.ok(borderIndex > statusFillIndex);
});

test('target mode updates app state and the Pixi projection without changing selection ownership', () => {
  setGraph();
  useUIStore.setState({ activeToggleId: 'target' });
  assert.deepEqual(
    applyPixiCanvasModeAction({ type: 'node', nodeId: 'outside-target', phase: 'down' }),
    { status: 'committed', id: 'outside-target' },
  );
  assert.equal(useFlowStore.getState().nodesMap.get('outside-target').data.isTarget, true);
  assert.equal(
    projection().graph.nodes.find((node) => node.id === 'outside-target').data.isTarget,
    true,
  );
  const targetNode = projection().graph.nodes.find((node) => node.id === 'outside-target');
  assert.ok(targetNode);
  const targetGeometry = createNodeGeometry(targetNode, { x: targetNode.x, y: targetNode.y });
  assert.equal(targetGeometry.uvs[0], 13.5 / 256);
  assert.deepEqual(
    applyPixiCanvasModeAction({ type: 'node', nodeId: 'outside-target', phase: 'down' }),
    { status: 'committed', id: 'outside-target' },
  );
  assert.equal(useFlowStore.getState().nodesMap.get('outside-target').data.isTarget, false);
});

test('multi-select mode selects app nodes so dashboard grouping can use the store selection', () => {
  const nodes = [
    recipeNode('selected-a', 'r_item_spawner_01', undefined, 20),
    recipeNode('selected-b', 'r_paper_mill_01', undefined, 340),
  ];
  useFlowStore.getState().setNodesAndEdges(nodes, [], { recordHistory: false, resetHistory: true });
  useUIStore.setState({ activeToggleId: 'multi_select' });

  assert.deepEqual(
    applyPixiCanvasModeAction({ type: 'node', nodeId: 'selected-a', phase: 'down' }),
    { status: 'committed', id: 'selected-a' },
  );
  assert.deepEqual(
    applyPixiCanvasModeAction({ type: 'node', nodeId: 'selected-b', phase: 'down' }),
    { status: 'committed', id: 'selected-b' },
  );
  assert.equal(
    useFlowStore
      .getState()
      .nodes.filter((node) => node.type === 'recipe' && node.data.isMultiSelected).length,
    2,
  );
  assert.equal(useFlowStore.getState().nodesMap.get('selected-b').data.isMultiSelected, true);
  assert.deepEqual(
    applyPixiCanvasModeAction({ type: 'node', nodeId: 'selected-b', phase: 'click' }),
    { status: 'committed', id: 'selected-b' },
  );
  assert.equal(useFlowStore.getState().nodesMap.get('selected-b').data.isMultiSelected, false);
  assert.deepEqual(
    applyPixiCanvasModeAction({ type: 'node', nodeId: 'selected-b', phase: 'down' }),
    { status: 'committed', id: 'selected-b' },
  );
  const groupId = useFlowStore.getState().createGroupFromSelection();
  assert.ok(groupId);
  assert.ok(useFlowStore.getState().nodesMap.has(groupId));
});

test('tutorial authorization rejects Pixi mode actions before app mutation', () => {
  setGraph();
  useUIStore.setState({ activeToggleId: 'target' });
  useTutorialStore.setState({ activeTutorialId: 'first-production-chain', currentStepIndex: 0 });
  const flow = useFlowStore.getState();
  const beforeNodes = flow.nodes;
  const beforeHistory = flow.historyPast;

  assert.deepEqual(
    applyPixiCanvasModeAction({ type: 'node', nodeId: 'outside-target', phase: 'down' }),
    { status: 'cancelled', reason: 'The current tutorial step does not authorize this action.' },
  );
  assert.equal(useFlowStore.getState().nodes, beforeNodes);
  assert.equal(useFlowStore.getState().historyPast, beforeHistory);
});

test('target mode lets node controls reach their authorized app action before delete hit handling', () => {
  assert.equal(shouldResolveDeleteAtPoint(false, false, false), false);
  assert.equal(shouldResolveDeleteAtPoint(false, false, true), true);
  assert.equal(shouldResolveDeleteAtPoint(false, true, false), true);
  assert.equal(
    shouldHandleDeleteTargetBeforeCanvasAction({ type: 'node', id: 'gearbox' }, false),
    false,
  );
  assert.equal(
    shouldHandleDeleteTargetBeforeCanvasAction({ type: 'node', id: 'gearbox' }, true),
    true,
  );
  assert.equal(
    shouldHandleDeleteTargetBeforeCanvasAction({ type: 'edge', id: 'edge-1' }, false),
    true,
  );
  assert.equal(
    shouldHandleDeleteTargetBeforeCanvasAction(
      {
        type: 'control-point',
        edgeId: 'edge-1',
        pointId: 'point-1',
      },
      false,
    ),
    true,
  );
});

test('opening any app overlay clears persistent and held canvas modes', () => {
  const openOverlays = [
    () => useUIStore.getState().setNodeEditorOpenId('gearbox'),
    () => useUIStore.getState().setRecipeSelectorOpen(true),
    () => useUIStore.getState().setSavesOverlayOpen(true),
    () => useUIStore.getState().setDataOverlayOpen(true),
    () => useUIStore.getState().setThemeOverlayOpen(true),
    () => useUIStore.getState().setResearchOverlayOpen(true),
    () => useUIStore.getState().setHelpOverlayOpen(true),
    () => useUIStore.getState().setIsLPSolverOpen(true),
  ];

  for (const openOverlay of openOverlays) {
    useUIStore.setState({
      activeToggleId: 'target',
      temporaryOverrides: ['delete_mode', 'multi_select'],
    });
    openOverlay();

    const uiState = useUIStore.getState();
    assert.equal(uiState.activeToggleId, null);
    assert.deepEqual(uiState.temporaryOverrides, []);
    assert.equal(getEffectiveToggleId(uiState), null);

    uiState.toggleButton('multi_select');
    uiState.pushOverride('target');
    assert.equal(getEffectiveToggleId(useUIStore.getState()), null);

    useUIStore.setState({
      activeToggleId: null,
      temporaryOverrides: [],
      isRecipeSelectorOpen: false,
      isSavesOverlayOpen: false,
      isDataOverlayOpen: false,
      isThemeOverlayOpen: false,
      isResearchOverlayOpen: false,
      isHelpOverlayOpen: false,
      isLPSolverOpen: false,
      nodeEditorOpenId: null,
    });
  }
});

test('opening a confirmation overlay clears canvas modes', async () => {
  useUIStore.setState({ activeToggleId: 'target', temporaryOverrides: ['delete_mode'] });
  const confirmation = useUIStore.getState().confirm({
    title: 'Confirm action',
    message: 'Continue?',
  });

  assert.equal(useUIStore.getState().confirmDialog?.options.title, 'Confirm action');
  assert.equal(getEffectiveToggleId(useUIStore.getState()), null);
  assert.deepEqual(useUIStore.getState().temporaryOverrides, []);

  useUIStore.getState().closeConfirm('close');
  assert.equal(await confirmation, false);
});

test('Pixi output row opens the recipe selector and clears the active canvas mode', () => {
  const gearbox = recipeNode('gearbox', 'r_craft_assembler_06', undefined, 40);
  useFlowStore.getState().setNodesAndEdges([gearbox], [], {
    recordHistory: false,
    resetHistory: true,
  });
  useUIStore.setState({ activeToggleId: 'target', temporaryOverrides: ['multi_select'] });

  const outputPortId = idGenerator.buildHandleId('gearbox', 'output', 0);
  const recipe = lookup.resolveActiveRecipe(gearbox.data.recipeId, gearbox.data.settings);
  assert.ok(recipe?.outputs[0]);
  assert.equal(activatePixiPortRow('gearbox', outputPortId), true);

  const uiState = useUIStore.getState();
  assert.equal(uiState.isRecipeSelectorOpen, true);
  assert.equal(uiState.preselectedSourceSide, 'output');
  assert.equal(uiState.preselectedNodeId, 'gearbox');
  assert.equal(uiState.preselectedHandleIndex, 0);
  assert.equal(uiState.preselectedProductId, recipe.outputs[0].product_id);
  assert.equal(uiState.activeToggleId, null);
  assert.deepEqual(uiState.temporaryOverrides, []);
  assert.equal(getEffectiveToggleId(uiState), null);
});

test('Pixi tutorial graph targets resolve stable app IDs to precise screen geometry', () => {
  setGraph();
  const queried = [];
  const removeAdapter = registerCanvasAdapter({
    canvasType: 'pixi',
    screenToGraph: (point) => point,
    centerOnGraphPoint: () => undefined,
    fitGraph: () => undefined,
    getNodeBounds: (nodeId) =>
      nodeId === 'outside-target' ? { x: 10, y: 20, width: 380, height: 220 } : null,
    getPortBounds: (nodeId, portId) => {
      queried.push(['port', nodeId, portId]);
      return { x: 20, y: 30, width: 12, height: 12 };
    },
    getPortRowBounds: (nodeId, portId) => {
      queried.push(['row', nodeId, portId]);
      return { x: 24, y: 34, width: 150, height: 32 };
    },
    getControlBounds: (nodeId, control) => {
      queried.push(['control', nodeId, control]);
      return { x: 40, y: 50, width: 20, height: 20 };
    },
    getGroupHeaderBounds: (groupId) => {
      queried.push(['header', groupId]);
      return { x: 60, y: 70, width: 400, height: 42 };
    },
    getEdgeGeometry: (edgeId) =>
      edgeId === 'boundary-edge'
        ? {
            bounds: { x: 4, y: 5, width: 90, height: 80 },
            points: [
              { x: 4, y: 5 },
              { x: 30, y: 5 },
              { x: 30, y: 80 },
              { x: 94, y: 80 },
            ],
          }
        : null,
    selectNodes: () => undefined,
    selectEdge: () => undefined,
    selectGroup: () => undefined,
  });
  const getNodeId = (alias) =>
    ({
      gearbox: 'outside-target',
      crankshaft: 'source',
      steelUtilityGroup: 'group-1',
    })[alias] ?? null;

  try {
    assert.deepEqual(
      resolvePixiTutorialGeometry(
        { kind: 'rect', alias: 'gearbox', side: 'input', index: 1 },
        getNodeId,
      ),
      { bounds: { x: 24, y: 34, width: 150, height: 32 } },
    );
    assert.deepEqual(
      resolvePixiTutorialGeometry({ kind: 'node-editor-button', alias: 'gearbox' }, getNodeId),
      { bounds: { x: 40, y: 50, width: 20, height: 20 } },
    );
    assert.deepEqual(
      resolvePixiTutorialGeometry(
        { kind: 'group', alias: 'steelUtilityGroup', part: 'bar' },
        getNodeId,
      ),
      { bounds: { x: 60, y: 70, width: 400, height: 42 } },
    );
    const edge = resolvePixiTutorialGeometry(
      {
        kind: 'edge',
        sourceAlias: 'crankshaft',
        sourceIndex: 0,
        targetAlias: 'gearbox',
        targetIndex: 0,
      },
      getNodeId,
    );
    assert.deepEqual(edge?.points, [
      { x: 4, y: 5 },
      { x: 30, y: 5 },
      { x: 30, y: 80 },
      { x: 94, y: 80 },
    ]);
    assert.deepEqual(queried, [
      ['row', 'outside-target', 'outside-target-input-1'],
      ['control', 'outside-target', 'node-menu'],
      ['header', 'group-1'],
    ]);
  } finally {
    removeAdapter();
  }
});

test('dashboard centering uses active canvas geometry instead of React Flow fallback dimensions', () => {
  const removeAdapter = registerCanvasAdapter({
    canvasType: 'pixi',
    screenToGraph: (point) => point,
    centerOnGraphPoint: () => undefined,
    fitGraph: () => undefined,
    getNodeBounds: () => ({ x: 120, y: 240, width: 380, height: 216 }),
    getPortBounds: () => null,
    getEdgeGeometry: () => null,
    selectNodes: () => undefined,
    selectEdge: () => undefined,
    selectGroup: () => undefined,
  });

  try {
    assert.deepEqual(getCanvasNodeCenter('gearbox', { x: 120, y: 240, width: 200, height: 120 }), {
      x: 310,
      y: 348,
    });
  } finally {
    removeAdapter();
  }
});

test('Pixi camera centering cancels the renderer origin before adding the canvas midpoint', () => {
  const graphPoint = { x: 310, y: 348 };
  const zoom = 1.2;
  const viewport = getViewportCenteredOnGraphPoint(graphPoint, zoom);

  assert.deepEqual(viewport, {
    x: -graphPoint.x * zoom,
    y: -graphPoint.y * zoom,
    zoom,
  });
  assert.equal(viewport.x + graphPoint.x * zoom, 0);
  assert.equal(viewport.y + graphPoint.y * zoom, 0);
});

test('initial collapsed-group projection refreshes proxy endpoints before caching edge bounds', () => {
  const endpointByEdge = new Map([['boundary-edge', 'member-source-port']]);
  const cachedEndpoints = new Map();

  initializeProjectedEdgeBounds(
    ['group-1'],
    ['boundary-edge'],
    (groupId) => endpointByEdge.set('boundary-edge', `${groupId}-proxy-port`),
    (edgeId) => cachedEndpoints.set(edgeId, endpointByEdge.get(edgeId)),
  );

  assert.equal(cachedEndpoints.get('boundary-edge'), 'group-1-proxy-port');
});

test('authored tutorials keep their original sequence and group explanation action', () => {
  const steps = getTutorialDefinition('first-production-chain').steps;

  assert.equal(
    steps.some((step) => step.id === 'move-gearbox-node'),
    false,
  );
  assert.equal(
    steps.some((step) => step.id === 'edit-crankshaft-route'),
    false,
  );
  assert.equal(
    steps.some((step) => step.id === 'reconnect-steel-plate-edge'),
    false,
  );
  const groupIntro = GROUP_TUTORIAL_STEPS.find((step) => step.id === 'explain-group-node');
  assert.equal(
    groupIntro.description,
    'Drag the group to move its recipes. Use the top bar to collapse it, or open its menu to change the label.',
  );
  assert.deepEqual(groupIntro.action, { type: 'continue' });
});

test('tutorial gestures permit movement and connection previews but gate connection commits', () => {
  const moveProposal = {
    type: 'move-nodes',
    positions: [{ id: 'gearbox', x: 300, y: 200 }],
  };
  const nodeDown = {
    type: 'activate-canvas-target',
    target: { type: 'node', nodeId: 'gearbox', phase: 'down' },
  };
  const groupDown = {
    type: 'activate-canvas-target',
    target: { type: 'group', groupId: 'steel-group' },
  };
  const handleDown = {
    type: 'activate-canvas-target',
    target: { type: 'port', nodeId: 'gearbox', portId: 'gearbox-output-0', phase: 'handle' },
  };
  const rowClick = {
    type: 'activate-canvas-target',
    target: { type: 'port', nodeId: 'gearbox', portId: 'gearbox-input-1', phase: 'row' },
  };
  const connection = {
    type: 'connect',
    first: { nodeId: 'gearbox', portId: 'gearbox-output-0', direction: 'output' },
    second: { nodeId: 'crankshaft', portId: 'crankshaft-input-0', direction: 'input' },
  };

  assert.equal(isPixiTutorialAuthorizationRequired(moveProposal, null), false);
  assert.equal(isPixiTutorialAuthorizationRequired(nodeDown, null), false);
  assert.equal(isPixiTutorialAuthorizationRequired(groupDown, null), false);
  assert.equal(isPixiTutorialAuthorizationRequired(handleDown, null), false);
  assert.equal(isPixiTutorialAuthorizationRequired(handleDown, 'target'), true);
  assert.equal(isPixiTutorialAuthorizationRequired(rowClick, null), true);
  assert.equal(isPixiTutorialAuthorizationRequired(connection, null), true);
  assert.equal(shouldPixiProposalAdvanceTutorial(moveProposal), false);
  assert.equal(shouldPixiProposalAdvanceTutorial(connection), true);
});

test('PNG export bounds use active graph geometry and retain route extents and padding', () => {
  const activeGeometry = [
    { minX: 100, minY: 80, maxX: 260, maxY: 200 },
    { minX: 90, minY: 60, maxX: 300, maxY: 220 },
    { minX: 300, minY: 110, maxX: 460, maxY: 115 },
  ];
  const bounds = unionCanvasExportBounds(activeGeometry);
  assert.deepEqual(bounds, { minX: 90, minY: 60, maxX: 460, maxY: 220 });

  const frame = createCanvasExportFrame(bounds, 50, 16384);
  assert.deepEqual(frame, {
    x: 40,
    y: 10,
    width: 470,
    height: 260,
    resolution: 1,
  });

  const afterDeletingDistantEntity = unionCanvasExportBounds(activeGeometry.slice(0, 2));
  assert.deepEqual(afterDeletingDistantEntity, { minX: 90, minY: 60, maxX: 300, maxY: 220 });
  assert.equal(
    createCanvasExportFrame({ minX: -100000, minY: 0, maxX: 100000, maxY: 100 }, 50, 16384)
      .resolution,
    (16384 - 100) / 200000,
  );
  assert.equal(unionCanvasExportBounds([]), null);
});

test('PNG export keeps output padding and bounds both dimensions and total pixels', () => {
  const frame = createCanvasExportFrame(
    { minX: -100000, minY: -100000, maxX: 100000, maxY: 100000 },
    50,
    16384,
  );
  assert.ok(frame);
  const outputWidth = Math.ceil(frame.width * frame.resolution);
  const outputHeight = Math.ceil(frame.height * frame.resolution);
  assert.ok(outputWidth <= 16384);
  assert.ok(outputHeight <= 16384);
  assert.ok(outputWidth * outputHeight <= 16_777_216);
  assert.ok(Math.abs((-100000 - frame.x) * frame.resolution - 50) < 1e-6);
  assert.ok(Math.abs((frame.y + frame.height - 100000) * frame.resolution - 50) < 1e-6);

  const unbounded = createCanvasExportFrame({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 50, 100);
  assert.equal(unbounded, null);
  assert.equal(
    createCanvasExportFrame(
      { minX: 0, minY: 0, maxX: Number.POSITIVE_INFINITY, maxY: 100 },
      50,
      16384,
    ),
    null,
  );
  assert.deepEqual(getNodeTextVisibility(0.1), { title: false, summary: false, ports: false });
  assert.deepEqual(getNodeTextVisibility(0.1, false, true), {
    title: true,
    summary: true,
    ports: true,
  });
});

test('Pixi PNG export preserves large-canvas resolution with bounded render tiles', () => {
  const bounds = { minX: 0, minY: 0, maxX: 7500, maxY: 7500 };
  const defaultFrame = createCanvasExportFrame(bounds, 50, 16384);
  const highResolutionFrame = createCanvasExportFrame(
    bounds,
    50,
    16384,
    MAX_CANVAS_EXPORT_PIXELS * 4,
  );

  assert.ok(defaultFrame && defaultFrame.resolution < 1);
  assert.ok(highResolutionFrame);
  assert.equal(highResolutionFrame.resolution, 1);

  const width = Math.ceil(highResolutionFrame.width * highResolutionFrame.resolution);
  const height = Math.ceil(highResolutionFrame.height * highResolutionFrame.resolution);
  const tiles = createCanvasExportTiles(width, height, 2048);
  assert.ok(tiles);
  assert.ok(tiles.every((tile) => tile.width <= 2048 && tile.height <= 2048));
  assert.equal(
    tiles.reduce((area, tile) => area + tile.width * tile.height, 0),
    width * height,
  );
  assert.ok(width * height > MAX_CANVAS_EXPORT_PIXELS);
  assert.ok(width * height <= MAX_CANVAS_EXPORT_PIXELS * 4);
  assert.equal(createCanvasExportTiles(0, height, 2048), null);
});

test('connection policy requires exact products or a typed wildcard with matching effective kinds', () => {
  assert.equal(areConnectionProductsCompatible('p_steel', 'p_steel', 'item', 'item'), true);
  assert.equal(areConnectionProductsCompatible('p_steel', 'p_copper', 'item', 'item'), false);
  assert.equal(
    areConnectionProductsCompatible('p_crude_oil', 'p_crude_oil', 'item', 'fluid'),
    false,
  );
  assert.equal(areConnectionProductsCompatible('any_item', 'p_crude_oil', 'item', 'item'), true);
  assert.equal(areConnectionProductsCompatible('p_crude_oil', 'any_item', 'item', 'item'), true);
  assert.equal(areConnectionProductsCompatible('any_fluid', 'p_crude_oil', 'fluid', 'item'), false);
  assert.equal(areConnectionProductsCompatible('any_item', 'any_fluid', 'item', 'fluid'), false);

  const source = { nodeId: 'source', portId: 'source-output-0', direction: 'output', kind: 'item' };
  const target = { nodeId: 'target', portId: 'target-input-0', direction: 'input', kind: 'item' };
  const isSameProduct = (first, second) =>
    areConnectionProductsCompatible(
      first.nodeId === 'source' ? 'p_steel' : 'p_copper',
      second.nodeId === 'source' ? 'p_steel' : 'p_copper',
      first.kind,
      second.kind,
    );
  const candidate = {
    endpoint: target,
    anchor: { x: 8, y: 8 },
    renderOrder: 1,
  };
  assert.equal(
    findNearestConnectablePort(source, [candidate], { x: 8, y: 8 }, 24, isSameProduct),
    null,
  );
  const draft = new ConnectionDraft(source, { x: 0, y: 0 }, isSameProduct);
  draft.update({ x: 8, y: 8 }, target, 1);
  assert.equal(
    draft.finish(target, () => true),
    null,
  );
});

test('recipe selector matching and auto-connect use the clicked port effective kind', () => {
  const wildcardItem = { product_id: 'any_item' };
  const wildcardFluid = { product_id: 'any_fluid' };
  const selectedCrudeOil = 'p_crude_oil';
  assert.equal(isProductEntryMatch(wildcardItem, selectedCrudeOil, 'item'), true);
  assert.equal(isProductEntryMatch(wildcardFluid, selectedCrudeOil, 'item'), false);
  assert.equal(isPotentialHandleTypeMatch(selectedCrudeOil, 'item'), true);
  assert.equal(
    findBestProductMatchIndex(
      [{ product_id: 'any_item' }, { product_id: selectedCrudeOil, handle_type: 'item' }],
      selectedCrudeOil,
      'item',
    ),
    1,
  );

  const source = recipeNode('refinery', 'r_residue_refinery_01', undefined, 80);
  const itemSink = recipeNode('item-sink', 'r_hyper_depot_01', undefined, 600);
  const fluidSink = recipeNode('fluid-sink', 'r_liquid_truck_depot_01', undefined, 1000);
  const nodes = [source, itemSink, fluidSink];
  const itemConnection = {
    source: source.id,
    sourceHandle: idGenerator.buildHandleId(source.id, 'output', 2),
    target: itemSink.id,
    targetHandle: idGenerator.buildHandleId(itemSink.id, 'input', 0),
  };
  const fluidConnection = {
    ...itemConnection,
    target: fluidSink.id,
    targetHandle: idGenerator.buildHandleId(fluidSink.id, 'input', 0),
  };
  assert.equal(isAppConnectionValid(itemConnection, { nodes, edges: [] }), true);
  assert.equal(isAppConnectionValid(fluidConnection, { nodes, edges: [] }), false);

  const recipe = lookup.resolveActiveRecipe('r_hyper_depot_01');
  assert.ok(recipe);
  const insertion = computeRecipeInsertion({
    recipe,
    preselectedNodeId: source.id,
    preselectedSourceSide: 'output',
    preselectedProductId: selectedCrudeOil,
    preselectedHandleType: 'item',
    preselectedHandleIndex: 2,
    derivedRate: 10,
    nodes,
    edges: [],
    screenToFlowPosition: (point) => point,
  });
  assert.equal(insertion.nextEdges.length, 1);
  assert.equal(insertion.nextEdges[0].source, source.id);
  assert.equal(insertion.nextEdges[0].sourceHandle, itemConnection.sourceHandle);
  assert.equal(
    insertion.nextEdges[0].targetHandle,
    idGenerator.buildHandleId(insertion.newNode.id, 'input', 0),
  );
  assert.ok(insertion.newNode.data.machineCount > 0);
});

test('connection validation resolves collapsed-group proxy ports to their real endpoints', () => {
  const group = groupNode();
  const source = recipeNode('group-source', 'r_residue_refinery_01', group.id, 40);
  const target = recipeNode('wildcard-target', 'r_hyper_depot_01', undefined, 600);
  const edge = {
    id: 'group-boundary',
    source: source.id,
    sourceHandle: idGenerator.buildHandleId(source.id, 'output', 2),
    target: target.id,
    targetHandle: idGenerator.buildHandleId(target.id, 'input', 0),
    data: {},
  };
  useFlowStore.getState().setNodesAndEdges([group, source, target], [edge], {
    recordHistory: false,
    resetHistory: true,
  });
  useFlowStore.getState().collapseGroup(group.id);
  const flow = useFlowStore.getState();
  const collapsedGroup = flow.nodesMap.get(group.id);
  assert.ok(collapsedGroup);
  assert.equal(
    collapsedGroup.data.outputProxyHandleIds[0],
    idGenerator.buildHandleId(source.id, 'output', 2),
  );
  const proxyPortId = idGenerator.buildHandleId(group.id, 'output', 0);
  const targetHandleId = idGenerator.buildHandleId(target.id, 'input', 0);
  assert.ok(proxyPortId);
  assert.equal(
    isAppConnectionValid(
      {
        source: collapsedGroup.id,
        sourceHandle: proxyPortId,
        target: target.id,
        targetHandle: targetHandleId,
      },
      { nodes: flow.nodes, edges: flow.edges },
    ),
    true,
  );
});

test('offscreen tutorial targets anchor to the nearest canvas edge with a direction', () => {
  const canvas = { x: 100, y: 80, width: 600, height: 400 };
  assert.deepEqual(getOffscreenTutorialAnchor({ x: 900, y: 180, width: 40, height: 40 }, canvas), {
    x: 700,
    y: 200,
    direction: 'right',
  });
  assert.deepEqual(getOffscreenTutorialAnchor({ x: 220, y: -100, width: 40, height: 40 }, canvas), {
    x: 240,
    y: 80,
    direction: 'up',
  });
  assert.equal(getOffscreenTutorialAnchor({ x: 200, y: 140, width: 40, height: 40 }, canvas), null);
});

test('delete mode removes real edges through app history and ignores unknown targets', () => {
  setGraph({ collapsed: true });
  useUIStore.setState({ activeToggleId: 'delete_mode' });
  const historyLength = useFlowStore.getState().historyPast.length;

  assert.deepEqual(applyPixiCanvasModeAction({ type: 'edge', edgeId: 'boundary-edge' }), {
    status: 'committed',
    id: 'boundary-edge',
  });
  assert.ok(!useFlowStore.getState().edges.some((edge) => edge.id === 'boundary-edge'));
  assert.ok(!useFlowStore.getState().edges.some((edge) => edge.id === 'proxy-boundary-edge'));
  assert.equal(useFlowStore.getState().historyPast.length, historyLength + 1);

  const previousNodes = useFlowStore.getState().nodes;
  assert.deepEqual(applyPixiCanvasModeAction({ type: 'node', nodeId: 'missing', phase: 'down' }), {
    status: 'unchanged',
  });
  assert.equal(useFlowStore.getState().nodes, previousNodes);
});

test('delete mode routes node hits before canvas controls while normal mode preserves them', () => {
  const nodeTarget = { type: 'node', id: 'group-1' };
  assert.equal(shouldHandleDeleteTargetBeforeCanvasAction(nodeTarget, false), false);
  assert.equal(shouldHandleDeleteTargetBeforeCanvasAction(nodeTarget, false, true), true);
  assert.equal(shouldHandleDeleteTargetBeforeCanvasAction(nodeTarget, true), true);
});

test('deleting a collapsed group removes its members and incident edges in one undoable action', () => {
  setGraph({ collapsed: true });
  useUIStore.setState({ activeToggleId: 'delete_mode' });
  const before = useFlowStore.getState();
  const historyLength = before.historyPast.length;

  assert.deepEqual(applyPixiCanvasModeAction({ type: 'group', groupId: 'group-1' }), {
    status: 'committed',
    id: 'group-1',
  });

  const deleted = useFlowStore.getState();
  assert.deepEqual([...deleted.nodesMap.keys()], ['outside-target']);
  assert.equal(deleted.edges.length, 0);
  assert.equal(deleted.groupMemberIds['group-1'], undefined);
  assert.equal(deleted.historyPast.length, historyLength + 1);

  deleted.undo();
  const restored = useFlowStore.getState();
  assert.ok(restored.nodesMap.has('group-1'));
  assert.ok(restored.nodesMap.has('source'));
  assert.ok(restored.nodesMap.has('inside-target'));
  assert.ok(restored.edges.some((item) => item.id === 'boundary-edge'));
  assert.ok(restored.edges.some((item) => item.id === 'internal-edge'));
});

test('Alt activation uses the app delete action even when delete mode is inactive', () => {
  setGraph();
  const historyLength = useFlowStore.getState().historyPast.length;
  assert.deepEqual(
    applyPixiCanvasModeAction({ type: 'edge', edgeId: 'boundary-edge', altKey: true }),
    { status: 'committed', id: 'boundary-edge' },
  );
  assert.ok(!useFlowStore.getState().edges.some((edge) => edge.id === 'boundary-edge'));
  assert.equal(useFlowStore.getState().historyPast.length, historyLength + 1);
});

test('port rate actions reject missing or stale app data without changing machine counts', () => {
  setGraph();
  const before = useFlowStore.getState().nodesMap.get('source').data.machineCount;
  assert.equal(applyConnectedPortRate('missing', { side: 'output', index: 0 }), false);
  const result = useFlowResultStore.getState();
  useFlowResultStore.setState({ graphVersion: useFlowStore.getState().graphVersion - 1 });
  assert.equal(applyConnectedPortRate('source', { side: 'output', index: 0 }), false);
  useFlowResultStore.setState(result);
  assert.equal(useFlowStore.getState().nodesMap.get('source').data.machineCount, before);
});
