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
const { buildLayoutEdges, buildLayoutNodes } = await viteServer.ssrLoadModule(
  '/src/layout/layoutGraphBuilder.ts',
);
const { applyLayoutResult } = await viteServer.ssrLoadModule('/src/layout/apply.ts');
const { snapToGrid } = await viteServer.ssrLoadModule('/src/layout/constants.ts');
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

function groupNode() {
  return {
    id: 'layout-group',
    type: 'group',
    position: { x: 80, y: 80 },
    data: {
      label: 'Layout group',
      collapsed: false,
      handlesReady: true,
      inputProxyHandleIds: [],
      outputProxyHandleIds: [],
    },
  };
}

function recipeNode(id, recipeId, x, groupId) {
  const recipe = lookup.resolveActiveRecipe(recipeId);
  assert.ok(recipe, `expected recipe ${recipeId}`);
  return {
    id,
    type: 'recipe',
    position: { x, y: 80 },
    data: {
      recipeId,
      machineCount: 1,
      inputOrder: recipe.inputs.map((_, index) => index),
      outputOrder: recipe.outputs.map((_, index) => index),
      settings: {},
      ...(groupId ? { groupId } : {}),
    },
  };
}

function edge(id, source, target, data = {}, targetIndex = 0) {
  return {
    id,
    source,
    sourceHandle: idGenerator.buildHandleId(source, 'output', 0),
    target,
    targetHandle: idGenerator.buildHandleId(target, 'input', targetIndex),
    data: { custom: id, ...data },
  };
}

function collapseConnectedGroup() {
  const nodes = [
    groupNode(),
    recipeNode('inside-source', 'r_item_spawner_01', 120, 'layout-group'),
    recipeNode('inside-target', 'r_paper_mill_01', 360, 'layout-group'),
    recipeNode('outside-source', 'r_item_spawner_01', 720),
    recipeNode('outside-target', 'r_paper_mill_01', 1000),
  ];
  const route = {
    controlPoints: [{ x: 200, y: 180 }],
    orthogonalTurns: [{ x: 240, y: 220 }],
  };
  const edges = [
    edge('internal-edge', 'inside-source', 'inside-target'),
    edge('outbound-edge', 'inside-source', 'outside-target', structuredClone(route)),
    edge('inbound-edge', 'outside-source', 'inside-target', structuredClone(route)),
  ];
  useFlowStore.getState().setNodesAndEdges(nodes, edges, {
    recordHistory: false,
    resetHistory: true,
  });
  useFlowStore.getState().collapseGroup('layout-group');
  return useFlowStore.getState();
}

function buildLayout(state) {
  const layoutNodes = buildLayoutNodes(state.nodes, lookup.resolveActiveRecipe);
  const layoutEdges = buildLayoutEdges(
    state.nodes,
    state.edges,
    new Set(layoutNodes.map((node) => node.id)),
  );
  return { layoutNodes, layoutEdges };
}

test('collapsed groups keep real boundary edges in layout when React Flow proxies are not ready', () => {
  const state = collapseConnectedGroup();
  const group = state.nodesMap.get('layout-group');
  assert.equal(group.data.collapsed, true);
  assert.equal(group.data.handlesReady, false);
  assert.equal(
    state.edges.some((item) => item.id.startsWith('proxy-')),
    false,
  );

  const { layoutNodes, layoutEdges } = buildLayout(state);
  assert.deepEqual(
    layoutNodes.map((node) => [node.id, node.kind]),
    [
      ['layout-group', 'collapsed-group'],
      ['outside-source', 'recipe'],
      ['outside-target', 'recipe'],
    ],
  );
  assert.deepEqual(
    layoutEdges.map(({ id, source, target, sourceHandle, targetHandle }) => ({
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
    })),
    [
      {
        id: 'inbound-edge',
        source: 'outside-source',
        target: 'layout-group',
        sourceHandle: 'outside-source-output-0',
        targetHandle: 'layout-group-input-0',
      },
      {
        id: 'outbound-edge',
        source: 'layout-group',
        target: 'outside-target',
        sourceHandle: 'layout-group-output-0',
        targetHandle: 'outside-target-input-0',
      },
    ],
  );
  assert.ok(layoutEdges.every((item) => !item.id.startsWith('proxy-')));
});

test('collapsed layout updates real and proxy routes while shifting hidden members with the group', () => {
  const state = collapseConnectedGroup();
  useFlowStore
    .getState()
    .updateGroupNodeData('layout-group', { handlesReady: true }, { recordHistory: false });
  const readyState = useFlowStore.getState();
  const { layoutNodes, layoutEdges } = buildLayout(readyState);
  const orthogonalTurns = [
    { x: 520, y: 320 },
    { x: 520, y: 460 },
  ];
  const layoutResult = {
    positions: new Map(
      layoutNodes.map((node) => [node.id, { x: node.position.x + 200, y: node.position.y + 120 }]),
    ),
    dimensions: new Map(
      layoutNodes.map((node) => [node.id, { width: node.width, height: node.height }]),
    ),
    inputOrders: new Map(layoutNodes.map((node) => [node.id, node.inputOrder])),
    outputOrders: new Map(layoutNodes.map((node) => [node.id, node.outputOrder])),
    edgeUpdates: new Map(layoutEdges.map((layoutEdge) => [layoutEdge.id, { orthogonalTurns }])),
  };

  const layout = applyLayoutResult(readyState.nodes, readyState.edges, layoutNodes, layoutResult);
  const beforeGroup = readyState.nodesMap.get('layout-group');
  const afterGroup = layout.nodes.find((node) => node.id === 'layout-group');
  const beforeMember = readyState.nodesMap.get('inside-source');
  const afterMember = layout.nodes.find((node) => node.id === 'inside-source');
  const groupDeltaX = afterGroup.position.x - beforeGroup.position.x;
  const groupDeltaY = afterGroup.position.y - beforeGroup.position.y;
  assert.deepEqual(
    afterMember.position,
    snapToGrid(beforeMember.position.x + groupDeltaX, beforeMember.position.y + groupDeltaY),
  );

  for (const edgeId of ['inbound-edge', 'outbound-edge']) {
    for (const id of [edgeId, `proxy-${edgeId}`]) {
      const updated = layout.edges.find((item) => item.id === id);
      assert.deepEqual(updated.data.orthogonalTurns, orthogonalTurns);
      assert.equal(updated.data.custom, edgeId);
    }
  }

  assert.equal(
    useFlowStore
      .getState()
      .applyAutoLayoutResult(layout.nodes, layout.edges, readyState.graphVersion),
    true,
  );
  const appliedEdges = useFlowStore.getState().edges;
  for (const edgeId of ['inbound-edge', 'outbound-edge']) {
    const proxy = appliedEdges.find((item) => item.id === `proxy-${edgeId}`);
    assert.deepEqual(proxy.data.orthogonalTurns, orthogonalTurns);
  }
});

test('collapsed proxy route geometry follows logical ports when layout reorders proxy handles', () => {
  const nodes = [
    groupNode(),
    recipeNode('inside-target', 'r_advanced_assembler_07', 360, 'layout-group'),
    recipeNode('outside-source', 'r_item_spawner_01', 720),
  ];
  const edges = [
    edge(
      'inbound-a',
      'outside-source',
      'inside-target',
      { orthogonalTurns: [{ x: 120, y: 120 }] },
      0,
    ),
    edge(
      'inbound-b',
      'outside-source',
      'inside-target',
      { orthogonalTurns: [{ x: 240, y: 240 }] },
      1,
    ),
  ];
  useFlowStore.getState().setNodesAndEdges(nodes, edges, {
    recordHistory: false,
    resetHistory: true,
  });
  useFlowStore.getState().collapseGroup('layout-group');
  useFlowStore
    .getState()
    .updateGroupNodeData('layout-group', { handlesReady: true }, { recordHistory: false });
  const state = useFlowStore.getState();
  const { layoutNodes, layoutEdges } = buildLayout(state);
  const reorderedInputIds = [
    ...state.nodesMap.get('layout-group').data.inputProxyHandleIds,
  ].reverse();
  const routes = new Map([
    ['inbound-a', [{ x: 300, y: 180 }]],
    ['inbound-b', [{ x: 420, y: 320 }]],
  ]);
  const result = applyLayoutResult(state.nodes, state.edges, layoutNodes, {
    positions: new Map(layoutNodes.map((node) => [node.id, node.position])),
    dimensions: new Map(
      layoutNodes.map((node) => [node.id, { width: node.width, height: node.height }]),
    ),
    inputOrders: new Map(
      layoutNodes.map((node) => [node.id, node.id === 'layout-group' ? [1, 0] : node.inputOrder]),
    ),
    outputOrders: new Map(layoutNodes.map((node) => [node.id, node.outputOrder])),
    edgeUpdates: new Map(
      layoutEdges.map((layoutEdge) => [
        layoutEdge.id,
        { orthogonalTurns: routes.get(layoutEdge.id) },
      ]),
    ),
  });

  assert.deepEqual(
    result.nodes.find((node) => node.id === 'layout-group').data.inputProxyHandleIds,
    reorderedInputIds,
  );
  assert.deepEqual(
    result.edges.find((item) => item.id === 'proxy-inbound-a').data.orthogonalTurns,
    routes.get('inbound-a'),
  );
  assert.deepEqual(
    result.edges.find((item) => item.id === 'proxy-inbound-b').data.orthogonalTurns,
    routes.get('inbound-b'),
  );
  assert.equal(
    useFlowStore.getState().applyAutoLayoutResult(result.nodes, result.edges, state.graphVersion),
    true,
  );

  const appliedEdges = useFlowStore.getState().edges;
  const proxyA = appliedEdges.find((item) => item.id === 'proxy-inbound-a');
  const proxyB = appliedEdges.find((item) => item.id === 'proxy-inbound-b');
  assert.equal(proxyA.targetHandle, 'layout-group-input-1');
  assert.equal(proxyB.targetHandle, 'layout-group-input-0');
  assert.deepEqual(proxyA.data.orthogonalTurns, routes.get('inbound-a'));
  assert.deepEqual(proxyB.data.orthogonalTurns, routes.get('inbound-b'));
});
