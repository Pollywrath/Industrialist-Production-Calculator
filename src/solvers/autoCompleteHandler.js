/**
 * autoCompleteHandler.js
 *
 * Caller layer between App.jsx and autoCompleter.js.
 * Responsibilities:
 *   1. Extract deficit map from current graph + flows
 *   2. Extract committed product IDs (what's already produced on canvas)
 *   3. Call solveAutoComplete
 *   4. Build React Flow node + edge objects from LP results
 *   5. Wire new nodes to each other and to existing canvas nodes
 */

import { getMachine } from '../data/dataLoader';
import { initializeRecipeTemperatures } from '../utils/appUtilities';
import { solveAutoComplete } from './autoCompleter';
import { clearFlowCache } from './flowCalculator';

const EPSILON = 1e-6;

// Horizontal/vertical spacing for auto-placed nodes
const NODE_WIDTH  = 340;
const NODE_HEIGHT = 200;
const COLUMN_GAP  = 80;
const ROW_GAP     = 40;

// ─── Deficit Extraction ───────────────────────────────────────────────────────

/**
 * Walk every committed node's inputs and collect unconnected deficits.
 *
 * @param {object[]} nodes     React Flow nodes
 * @param {object}   flows     productionSolution.flows
 * @returns {Map<string, number>}  productId → required rate (units/s)
 */
const extractDeficits = (nodes, flows) => {
  const deficits = new Map();

  for (const node of nodes) {
    const recipe = node.data?.recipe;
    const machineCount = node.data?.machineCount || 0;
    if (!recipe || machineCount <= 0) continue;

    const nodeFlows = flows?.byNode?.[node.id];
    if (!nodeFlows) continue;

    const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';
    let cycleTime = recipe.cycle_time;
    if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;

    recipe.inputs?.forEach((input, idx) => {
      const productId = input.product_id;
      if (!productId || productId === 'p_variableproduct') return;
      if (typeof input.quantity !== 'number') return;

      const inputFlow = nodeFlows.inputFlows?.[idx];
      if (!inputFlow) return;

      const needed    = inputFlow.needed    ?? 0;
      const connected = inputFlow.connected ?? 0;
      const shortage  = needed - connected;

      if (shortage > EPSILON) {
        deficits.set(productId, (deficits.get(productId) || 0) + shortage);
      }
    });
  }

  return deficits;
};

/**
 * Collect the set of product IDs currently being produced on canvas.
 * BFS stops at these — no need to re-expand.
 *
 * @param {object[]} nodes
 * @returns {Set<string>}
 */
const extractCommittedProducts = (nodes) => {
  const committed = new Set();
  for (const node of nodes) {
    const recipe = node.data?.recipe;
    if (!recipe) continue;
    recipe.outputs?.forEach(output => {
      if (output.product_id && output.product_id !== 'p_variableproduct') {
        committed.add(output.product_id);
      }
    });
  }
  return committed;
};

// ─── Node Builder ─────────────────────────────────────────────────────────────

/**
 * Build a React Flow node object for an autocompleted recipe.
 *
 * @param {string}   nodeId
 * @param {object}   recipe
 * @param {number}   machineCount
 * @param {object}   position        { x, y }
 * @param {object}   callbacks       from createNodeCallbacks()
 * @param {object}   opts            { displayMode, machineDisplayMode, globalPollution, edgeSettings }
 * @returns {object} React Flow node
 */
const buildNode = (nodeId, recipe, machineCount, position, callbacks, opts) => {
  const { displayMode, machineDisplayMode, globalPollution } = opts;
  const machine = getMachine(recipe.machine_id);
  if (!machine) return null;

  const initializedRecipe = initializeRecipeTemperatures(recipe, machine.id);

  return {
    id: nodeId,
    type: 'custom',
    position,
    data: {
      recipe: initializedRecipe,
      machine,
      machineCount,
      displayMode,
      machineDisplayMode,
      leftHandles:  recipe.inputs.length,
      rightHandles: recipe.outputs.length,
      ...callbacks,
      globalPollution,
      isTarget: false,
      flows: null,
      suggestions: [],
    },
    sourcePosition: 'right',
    targetPosition: 'left',
  };
};

// ─── Edge Builder ─────────────────────────────────────────────────────────────

/**
 * Wire all new nodes to each other and to existing canvas nodes.
 *
 * For every input of every new node, find the best source node (new or existing)
 * that produces the required product and add an edge.
 *
 * @param {object[]}           newNodes         newly built React Flow nodes
 * @param {object[]}           existingNodes    committed canvas nodes
 * @param {object}             edgeSettings
 * @returns {object[]}         new React Flow edge objects
 */
const buildEdges = (newNodes, existingNodes, edgeSettings) => {
  const edges = [];

  // Build a lookup: productId → [{ node, outputIndex }]
  const producers = new Map();

  const registerOutputs = (node) => {
    node.data.recipe.outputs?.forEach((output, idx) => {
      if (!output.product_id || output.product_id === 'p_variableproduct') return;
      if (!producers.has(output.product_id)) producers.set(output.product_id, []);
      producers.get(output.product_id).push({ node, outputIndex: idx });
    });
  };

  // Register existing (committed) nodes first — prefer them as sources
  existingNodes.forEach(registerOutputs);
  // Then new nodes — used as fallback or when existing doesn't produce it
  newNodes.forEach(registerOutputs);

  const edgeSet = new Set(); // dedup key: source:sourceHandle:target:targetHandle

  const addEdge = (sourceNode, sourceOutputIdx, targetNode, targetInputIdx) => {
    const key = `${sourceNode.id}:right-${sourceOutputIdx}:${targetNode.id}:left-${targetInputIdx}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push({
      id: `e-ac-${sourceNode.id}-${sourceOutputIdx}-${targetNode.id}-${targetInputIdx}`,
      source:       sourceNode.id,
      sourceHandle: `right-${sourceOutputIdx}`,
      target:       targetNode.id,
      targetHandle: `left-${targetInputIdx}`,
      type: 'custom',
      animated: false,
      data: edgeSettings,
    });
  };

  // Wire inputs of all new nodes — prefer new nodes as sources, fall back to existing
  for (const targetNode of newNodes) {
    targetNode.data.recipe.inputs?.forEach((input, inputIdx) => {
      const productId = input.product_id;
      if (!productId || productId === 'p_variableproduct') return;
      const candidates = producers.get(productId) || [];
      if (candidates.length === 0) return;
      const newCandidate      = candidates.find(c => newNodes.includes(c.node));
      const existingCandidate = candidates.find(c => existingNodes.includes(c.node));
      const chosen = newCandidate || existingCandidate;
      if (!chosen) return;
      addEdge(chosen.node, chosen.outputIndex, targetNode, inputIdx);
    });
  }

  // Wire outputs of new nodes → existing nodes that need them (the original deficient inputs)
  for (const sourceNode of newNodes) {
    sourceNode.data.recipe.outputs?.forEach((output, outputIdx) => {
      const productId = output.product_id;
      if (!productId || productId === 'p_variableproduct') return;
      for (const existingNode of existingNodes) {
        existingNode.data.recipe.inputs?.forEach((input, inputIdx) => {
          if (input.product_id !== productId) return;
          addEdge(sourceNode, outputIdx, existingNode, inputIdx);
        });
      }
    });
  }

  return edges;
};

// ─── Layout ───────────────────────────────────────────────────────────────────

/**
 * Assign grid positions to new nodes, placed to the left of the leftmost
 * existing node so they don't overlap the current canvas.
 */
const assignPositions = (newNodes, existingNodes) => {
  if (newNodes.length === 0) return;

  // Find left boundary of current canvas
  const minX = existingNodes.reduce((min, n) => Math.min(min, n.position?.x ?? 0), 0);
  const minY = existingNodes.reduce((min, n) => Math.min(min, n.position?.y ?? 0), 0);

  // Stack columns leftward from minX
  const cols = Math.ceil(Math.sqrt(newNodes.length));
  const startX = minX - (cols * (NODE_WIDTH + COLUMN_GAP)) - COLUMN_GAP;

  newNodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    node.position = {
      x: startX + col * (NODE_WIDTH + COLUMN_GAP),
      y: minY  + row * (NODE_HEIGHT + ROW_GAP),
    };
  });
};

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Run autocomplete and return new nodes + edges to add to the canvas.
 *
 * Usage in App.jsx:
 *
 *   const result = await runAutoComplete({
 *     nodes, flows: productionSolution.flows,
 *     currentNodeId, setNodeId,
 *     activeWeights, unusedWeights,
 *     createNodeCallbacks, edgeSettings,
 *     displayMode, machineDisplayMode, globalPollution,
 *   });
 *
 *   if (result.newNodes.length > 0) {
 *     setNodes(nds => [...nds, ...result.newNodes]);
 *     setEdges(eds => [...eds, ...result.newEdges]);
 *     setNodeId(result.nextNodeId);
 *     clearFlowCache();
 *     triggerRecalculation('node');
 *   }
 *
 * @returns {Promise<{
 *   newNodes:    object[],
 *   newEdges:    object[],
 *   nextNodeId:  number,
 *   stats:       object,
 *   feasible:    boolean,
 * }>}
 */
export const runAutoComplete = async ({
  nodes,
  flows,
  currentNodeId,
  activeWeights    = [],
  unusedWeights    = [],
  createNodeCallbacks,
  edgeSettings     = {},
  displayMode,
  machineDisplayMode,
  globalPollution,
}) => {
  // ── 1. Extract deficits + committed products ──
  const deficits          = extractDeficits(nodes, flows);
  const committedProducts = extractCommittedProducts(nodes);

  if (deficits.size === 0) {
    return { newNodes: [], newEdges: [], nextNodeId: currentNodeId, feasible: true, stats: { recipesEvaluated: 0, recipesSelected: 0, message: 'No deficiencies found — graph is already satisfied.' } };
  }

  console.log(`[AutoComplete] Found ${deficits.size} deficient products:`, [...deficits.entries()].map(([k, v]) => `${k}: ${v.toFixed(4)}/s`).join(', '));

  // ── 3. Solve ──
  const { feasible, recipes, stats } = await solveAutoComplete(deficits, committedProducts, activeWeights, unusedWeights);

  if (!feasible || recipes.length === 0) {
    return { newNodes: [], newEdges: [], nextNodeId: currentNodeId, feasible, stats: { ...stats, message: 'AutoComplete LP returned no feasible solution.' } };
  }

  // ── 4. Build node objects ──
  const callbacks = createNodeCallbacks();
  const opts = { displayMode, machineDisplayMode, globalPollution, edgeSettings };

  let idCounter = currentNodeId;
  const newNodes = [];

  for (const { recipe, machineCount } of recipes) {
    const nodeId = `node-${idCounter++}`;
    const node = buildNode(nodeId, recipe, machineCount, { x: 0, y: 0 }, callbacks, opts);
    if (node) newNodes.push(node);
  }

  // ── 5. Assign positions ──
  assignPositions(newNodes, nodes);

  // ── 6. Wire edges ──
  const newEdges = buildEdges(newNodes, nodes, edgeSettings);

  console.group(`[AutoComplete] Placing ${newNodes.length} nodes, ${newEdges.length} edges`);
  newNodes.forEach(n => console.log(`  NODE [${n.id}] ${n.data.recipe.name} machines=${n.data.machineCount.toFixed(4)}`));
  newEdges.forEach(e => console.log(`  EDGE ${e.source}(${e.sourceHandle}) → ${e.target}(${e.targetHandle})`));
  console.groupEnd();

  return {
    newNodes,
    newEdges,
    nextNodeId: idCounter,
    feasible: true,
    stats: {
      ...stats,
      nodesPlaced: newNodes.length,
      edgesWired:  newEdges.length,
    },
  };
};