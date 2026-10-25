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
const { useFlowStore } = await viteServer.ssrLoadModule('/src/stores/useFlowStore.ts');
const idGenerator = await viteServer.ssrLoadModule('/src/utils/idGenerator.ts');

after(async () => {
  await viteServer.close();
});

beforeEach(() => {
  useFlowStore.getState().setNodesAndEdges([], [], {
    recordHistory: false,
    resetHistory: true,
  });
});

function groupNode(collapsed = false) {
  return {
    id: 'group-1',
    type: 'group',
    position: { x: 0, y: 0 },
    data: {
      label: 'Group',
      collapsed,
      handlesReady: false,
      inputProxyHandleIds: [],
      outputProxyHandleIds: [],
    },
  };
}

function recipeNode(id, recipeId, groupId, x) {
  return {
    id,
    type: 'recipe',
    position: { x, y: 40 },
    data: { recipeId, machineCount: 1, settings: {}, ...(groupId ? { groupId } : {}) },
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

function graph({ collapsed = false } = {}) {
  const nodes = [
    groupNode(),
    recipeNode('source', 'r_item_spawner_01', 'group-1', 40),
    recipeNode('internal-target', 'r_paper_mill_01', 'group-1', 280),
    recipeNode('outside-target', 'r_paper_mill_01', undefined, 620),
  ];
  const routes = {
    controlPoints: [{ x: 100, y: 120 }],
    orthogonalTurns: [{ x: 140, y: 180 }],
    routeLabel: 'preserve this metadata',
    custom: { owner: 'user' },
  };
  const edges = [
    edge('internal-edge', 'source', 'internal-target', structuredClone(routes)),
    edge('boundary-edge', 'source', 'outside-target', structuredClone(routes)),
    edge('self-loop', 'source', 'source', structuredClone(routes)),
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

function positionsFor(ids) {
  const nodesById = useFlowStore.getState().nodesMap;
  return new Map(
    ids.map((id) => {
      const node = nodesById.get(id);
      assert.ok(node, `expected node ${id}`);
      return [id, { x: node.position.x, y: node.position.y }];
    }),
  );
}

function edgeById(id) {
  const edge = useFlowStore.getState().edges.find((candidate) => candidate.id === id);
  assert.ok(edge, `expected edge ${id}`);
  return edge;
}

function routeData(id) {
  return edgeById(id).data;
}

function assertTranslatedRoutes(id, dx, dy) {
  const route = routeData(id);
  assert.deepEqual(route.controlPoints, [{ x: 100 + dx, y: 120 + dy }]);
  assert.deepEqual(route.orthogonalTurns, [{ x: 140 + dx, y: 180 + dy }]);
  assert.equal(route.routeLabel, 'preserve this metadata');
  assert.deepEqual(route.custom, { owner: 'user' });
}

test('whole-group movement translates both internal routes and position undo/redo restores them', () => {
  graph();
  const store = useFlowStore.getState();
  const ids = ['group-1', 'source', 'internal-target'];
  const startPositions = positionsFor(ids);
  const graphVersion = store.graphVersion;
  const beforeInternal = structuredClone(routeData('internal-edge'));
  const beforeBoundary = structuredClone(routeData('boundary-edge'));

  store.captureDragStart(ids, 'group-1');
  store.moveNodesFromSnapshots(startPositions, 12, -7);
  store.commitDragStop(ids);

  assertTranslatedRoutes('internal-edge', 12, -7);
  assert.deepEqual(routeData('boundary-edge'), beforeBoundary);
  assertTranslatedRoutes('self-loop', 12, -7);
  assert.equal(useFlowStore.getState().graphVersion, graphVersion);
  assert.equal(useFlowStore.getState().historyPast.length, 1);
  assert.equal(useFlowStore.getState().historyPast[0].kind, 'position');

  useFlowStore.getState().undo();
  assert.deepEqual(routeData('internal-edge'), beforeInternal);
  assert.deepEqual(routeData('boundary-edge'), beforeBoundary);
  assertTranslatedRoutes('self-loop', 0, 0);
  assert.deepEqual(
    ['group-1', 'source', 'internal-target'].map((id) => {
      const node = useFlowStore.getState().nodesMap.get(id);
      return { id, x: node.position.x, y: node.position.y };
    }),
    ids.map((id) => ({ id, ...startPositions.get(id) })),
  );
  assert.equal(useFlowStore.getState().graphVersion, graphVersion);

  useFlowStore.getState().redo();
  assertTranslatedRoutes('internal-edge', 12, -7);
  assert.deepEqual(routeData('boundary-edge'), beforeBoundary);
  assertTranslatedRoutes('self-loop', 12, -7);
  assert.equal(useFlowStore.getState().graphVersion, graphVersion);
});

test('position proposals commit through the app store and remain undoable', () => {
  graph();
  const store = useFlowStore.getState();
  const ids = ['source', 'internal-target'];
  const starts = positionsFor(ids);
  const targets = new Map(
    ids.map((id) => {
      const start = starts.get(id);
      assert.ok(start);
      return [id, { x: start.x + 19, y: start.y + 13 }];
    }),
  );
  const versionBefore = store.graphVersion;

  store.captureDragStart(ids, 'group-1');
  store.moveNodesToPositions(targets);
  store.commitDragStop(ids);

  assert.equal(useFlowStore.getState().graphVersion, versionBefore);
  assert.equal(useFlowStore.getState().historyPast.length, 1);
  assertTranslatedRoutes('internal-edge', 19, 13);
  assertTranslatedRoutes('self-loop', 19, 13);

  useFlowStore.getState().undo();
  assert.equal(useFlowStore.getState().nodesMap.get('source')?.position.x, starts.get('source')?.x);
  assert.deepEqual(routeData('internal-edge'), {
    controlPoints: [{ x: 100, y: 120 }],
    orthogonalTurns: [{ x: 140, y: 180 }],
    routeLabel: 'preserve this metadata',
    custom: { owner: 'user' },
  });
  useFlowStore.getState().redo();
  assert.equal(
    useFlowStore.getState().nodesMap.get('source')?.position.x,
    targets.get('source')?.x,
  );
});

test('rigid multi-selection movement translates routes between selected endpoints', () => {
  graph();
  const store = useFlowStore.getState();
  const ids = ['source', 'internal-target'];
  const starts = positionsFor(ids);
  const targets = new Map(
    ids.map((id) => {
      const start = starts.get(id);
      assert.ok(start);
      return [id, { x: start.x + 19, y: start.y + 13 }];
    }),
  );
  const beforeRoute = structuredClone(routeData('internal-edge'));

  store.captureDragStart(ids);
  store.moveNodesToPositions(targets);
  store.commitDragStop(ids);

  assertTranslatedRoutes('internal-edge', 19, 13);
  assertTranslatedRoutes('self-loop', 19, 13);
  assert.equal(useFlowStore.getState().historyPast.length, 1);
  assert.deepEqual(
    useFlowStore
      .getState()
      .historyPast[0].edgeRoutes.map(({ id }) => id)
      .sort(),
    ['internal-edge', 'self-loop'],
  );

  useFlowStore.getState().undo();
  assert.deepEqual(routeData('internal-edge'), beforeRoute);
  assertTranslatedRoutes('self-loop', 0, 0);

  useFlowStore.getState().redo();
  assertTranslatedRoutes('internal-edge', 19, 13);
  assertTranslatedRoutes('self-loop', 19, 13);
});

test('connection actions reject invalid endpoints before graph, version, or history changes', () => {
  graph();
  const before = useFlowStore.getState();
  const edgeCount = before.edges.length;
  const historyCount = before.historyPast.length;
  const graphVersion = before.graphVersion;
  const sourceHandle = idGenerator.buildHandleId('source', 'output', 999);
  const targetHandle = idGenerator.buildHandleId('outside-target', 'input', 0);

  before.onConnect({
    source: 'source',
    sourceHandle,
    target: 'outside-target',
    targetHandle,
  });

  const after = useFlowStore.getState();
  assert.equal(after.edges.length, edgeCount);
  assert.equal(after.historyPast.length, historyCount);
  assert.equal(after.graphVersion, graphVersion);
});

test('app connection actions accept a compatible boundary proxy and preserve real identities', () => {
  graph({ collapsed: true });
  const store = useFlowStore.getState();
  const group = store.nodesMap.get('group-1');
  assert.ok(group?.type === 'group');
  const sourcePort = group.data.outputProxyHandleIds[0];
  assert.ok(sourcePort);
  const targetPort = idGenerator.buildHandleId('outside-target', 'input', 0);
  store.setEdges(
    store.edges.filter((candidate) => candidate.id !== 'boundary-edge'),
    {
      recordHistory: false,
      resetHistory: true,
    },
  );
  useFlowStore.getState().onConnect({
    source: group.id,
    sourceHandle: sourcePort,
    target: 'outside-target',
    targetHandle: targetPort,
  });

  const after = useFlowStore.getState();
  const created = after.edges.find(
    (candidate) =>
      !candidate.id.startsWith('proxy-') &&
      candidate.source === 'source' &&
      candidate.sourceHandle === idGenerator.buildHandleId('source', 'output', 0) &&
      candidate.target === 'outside-target' &&
      candidate.targetHandle === targetPort,
  );
  assert.ok(created);
  assert.ok(after.edges.some((candidate) => candidate.id === `proxy-${created.id}`));
  assert.equal(after.historyPast.length, 1);
});

test('reconnect rejection leaves the real edge, proxy, route, and history unchanged', () => {
  graph({ collapsed: true });
  const before = useFlowStore.getState();
  const edgeBefore = structuredClone(edgeById('boundary-edge'));
  const historyBefore = before.historyPast;
  const graphVersion = before.graphVersion;
  const result = before.reconnectEdgeEndpoint(
    'boundary-edge',
    'target',
    'outside-target',
    idGenerator.buildHandleId('outside-target', 'input', 999),
  );

  assert.equal(result.status, 'invalid');
  assert.deepEqual(edgeById('boundary-edge'), edgeBefore);
  assert.equal(useFlowStore.getState().historyPast, historyBefore);
  assert.equal(useFlowStore.getState().graphVersion, graphVersion);
});

test('valid reconnect preserves edge data and commits one app history entry', () => {
  graph({ collapsed: true });
  const store = useFlowStore.getState();
  store.setEdges(
    store.edges.filter((candidate) => candidate.id !== 'boundary-edge'),
    {
      recordHistory: false,
      resetHistory: true,
    },
  );
  const before = structuredClone(edgeById('internal-edge'));
  const beforeVersion = useFlowStore.getState().graphVersion;

  const result = useFlowStore
    .getState()
    .reconnectEdgeEndpoint(
      'internal-edge',
      'target',
      'outside-target',
      idGenerator.buildHandleId('outside-target', 'input', 0),
    );

  assert.equal(result.status, 'reconnected');
  const after = edgeById('internal-edge');
  assert.equal(after.source, before.source);
  assert.equal(after.sourceHandle, before.sourceHandle);
  assert.equal(after.target, 'outside-target');
  assert.equal(after.targetHandle, idGenerator.buildHandleId('outside-target', 'input', 0));
  assert.deepEqual(after.data, before.data);
  assert.ok(
    useFlowStore.getState().edges.some((candidate) => candidate.id === 'proxy-internal-edge'),
  );
  assert.equal(useFlowStore.getState().graphVersion, beforeVersion + 1);
  assert.equal(useFlowStore.getState().historyPast.length, 1);
});

test('route edits preserve edge metadata without changing calculation versions', () => {
  graph({ collapsed: true });
  const before = useFlowStore.getState();
  const edgeBefore = structuredClone(edgeById('boundary-edge'));
  const proxyBefore = structuredClone(edgeById('proxy-boundary-edge'));
  const historyCountBefore = before.historyPast.length;
  const versionBefore = before.graphVersion;
  const solutionVersionBefore = before.solutionVersion;
  const routePoints = [
    { x: 125, y: 140 },
    { x: 180, y: 160 },
  ];

  assert.equal(before.setEdgeRoutePoints('boundary-edge', 'controlPoints', routePoints), true);
  const after = useFlowStore.getState();
  const edgeAfter = edgeById('boundary-edge');
  assert.deepEqual(edgeAfter.data.controlPoints, routePoints);
  assert.equal(edgeAfter.data.routeLabel, edgeBefore.data.routeLabel);
  assert.deepEqual(edgeById('proxy-boundary-edge').data.controlPoints, routePoints);
  assert.deepEqual(
    edgeById('proxy-boundary-edge').data.orthogonalTurns,
    proxyBefore.data.orthogonalTurns,
  );
  assert.equal(after.historyPast.length, historyCountBefore + 1);
  assert.equal(after.graphVersion, versionBefore);
  assert.equal(after.solutionVersion, solutionVersionBefore);
  assert.notEqual(after.edges, before.edges);

  const unchangedEdges = after.edges;
  const historyCountAfterEdit = after.historyPast.length;
  assert.equal(after.setEdgeRoutePoints('boundary-edge', 'controlPoints', routePoints), false);
  assert.equal(useFlowStore.getState().edges, unchangedEdges);
  assert.equal(useFlowStore.getState().historyPast.length, historyCountAfterEdit);

  const stateBeforeInvalid = useFlowStore.getState();
  assert.equal(
    stateBeforeInvalid.setEdgeRoutePoints('boundary-edge', 'orthogonalTurns', [
      { x: Number.NaN, y: 0 },
    ]),
    false,
  );
  assert.equal(useFlowStore.getState().edges, stateBeforeInvalid.edges);

  useFlowStore.getState().undo();
  assert.deepEqual(edgeById('boundary-edge').data.controlPoints, edgeBefore.data.controlPoints);
  assert.deepEqual(
    edgeById('proxy-boundary-edge').data.controlPoints,
    proxyBefore.data.controlPoints,
  );
  useFlowStore.getState().redo();
  assert.deepEqual(edgeById('boundary-edge').data.controlPoints, routePoints);
  assert.deepEqual(edgeById('proxy-boundary-edge').data.controlPoints, routePoints);
});

test('moving one member shifts its self-loop but leaves group-internal routes in place', () => {
  graph();
  const graphVersion = useFlowStore.getState().graphVersion;
  const beforeInternal = structuredClone(routeData('internal-edge'));
  const startPositions = positionsFor(['source']);
  const sourceBefore = startPositions.get('source');

  useFlowStore.getState().captureDragStart(['source']);
  useFlowStore.getState().moveNodesFromSnapshots(startPositions, -8, 16);
  useFlowStore.getState().commitDragStop(['source']);

  assert.deepEqual(routeData('internal-edge'), beforeInternal);
  assertTranslatedRoutes('self-loop', -8, 16);
  assert.deepEqual(useFlowStore.getState().nodesMap.get('source').position, {
    x: sourceBefore.x - 8,
    y: sourceBefore.y + 16,
  });
  assert.deepEqual(
    useFlowStore
      .getState()
      .historyPast.at(-1)
      .edgeRoutes.map(({ id }) => id),
    ['self-loop'],
  );
  assert.equal(useFlowStore.getState().graphVersion, graphVersion);
});

test('collapsed-group movement shifts hidden internal routes and leaves boundary proxies alone', () => {
  graph();
  useFlowStore.getState().collapseGroup('group-1');
  useFlowStore
    .getState()
    .updateGroupNodeData('group-1', { handlesReady: true }, { recordHistory: false });
  useFlowStore.getState().clearHistory();

  const proxy = edgeById('proxy-boundary-edge');
  const proxyBefore = structuredClone(proxy);
  const internalBefore = structuredClone(routeData('internal-edge'));
  const graphVersion = useFlowStore.getState().graphVersion;
  assert.equal(useFlowStore.getState().nodesMap.get('source').hidden, true);
  assert.equal(useFlowStore.getState().nodesMap.get('internal-target').hidden, true);
  assert.equal(
    useFlowStore.getState().edges.some((candidate) => candidate.id === 'proxy-internal-edge'),
    false,
  );

  const ids = ['group-1', 'source', 'internal-target'];
  const startPositions = positionsFor(ids);
  useFlowStore.getState().captureDragStart(ids, 'group-1');
  useFlowStore.getState().moveNodesFromSnapshots(startPositions, 5, 11);
  useFlowStore.getState().commitDragStop(ids);

  assert.deepEqual(routeData('internal-edge').controlPoints, [
    { x: internalBefore.controlPoints[0].x + 5, y: internalBefore.controlPoints[0].y + 11 },
  ]);
  assert.deepEqual(routeData('internal-edge').orthogonalTurns, [
    { x: internalBefore.orthogonalTurns[0].x + 5, y: internalBefore.orthogonalTurns[0].y + 11 },
  ]);
  assert.deepEqual(edgeById('proxy-boundary-edge'), proxyBefore);
  assert.deepEqual(routeData('boundary-edge'), {
    controlPoints: [{ x: 100, y: 120 }],
    orthogonalTurns: [{ x: 140, y: 180 }],
    routeLabel: 'preserve this metadata',
    custom: { owner: 'user' },
  });
  assert.equal(useFlowStore.getState().graphVersion, graphVersion);
});

test('collapsed-group position proposals move and restore the group with its hidden members', () => {
  graph({ collapsed: true });
  const store = useFlowStore.getState();
  const ids = ['group-1', 'source', 'internal-target'];
  const starts = positionsFor(ids);
  const targets = new Map(
    ids.map((id) => {
      const start = starts.get(id);
      assert.ok(start);
      return [id, { x: start.x + 24, y: start.y + 16 }];
    }),
  );
  const graphVersion = store.graphVersion;

  store.captureDragStart(ids, 'group-1');
  store.moveNodesToPositions(targets);
  store.commitDragStop(ids);

  assert.deepEqual(
    ids.map((id) => useFlowStore.getState().nodesMap.get(id).position),
    ids.map((id) => ({ x: starts.get(id).x + 24, y: starts.get(id).y + 16 })),
  );
  assert.equal(useFlowStore.getState().historyPast.length, 1);
  assert.equal(useFlowStore.getState().graphVersion, graphVersion);

  useFlowStore.getState().undo();
  assert.deepEqual(
    ids.map((id) => useFlowStore.getState().nodesMap.get(id).position),
    ids.map((id) => starts.get(id)),
  );
  useFlowStore.getState().redo();
  assert.deepEqual(
    ids.map((id) => useFlowStore.getState().nodesMap.get(id).position),
    ids.map((id) => ({ x: starts.get(id).x + 24, y: starts.get(id).y + 16 })),
  );
});
