/**
 * LP/MIP Solver for Production Networks
 * Automatically adjusts machine counts to balance production for target recipes.
 *
 * Uses SCIP (Solving Constraint Integer Programs) compiled to WebAssembly.
 * SCIP © Zuse Institute Berlin — Apache License 2.0
 * https://www.scipopt.org/
 */

import { getMachine } from '../data/dataLoader';
import { buildProductionGraph } from './graphBuilder';

const EPSILON = 1e-8;

const sanitizeVarName = (name) => {
  return name.replace(/-/g, '_');
};

// Deficiency weights are pinned — always dominate all other objectives regardless of user ordering
const DEFICIENCY_COUNT_WEIGHT          = 1e15;
const DEFICIENCY_AMOUNT_WEIGHT         = 1e12;
const DEFICIENCY_AMOUNT_WEIGHT_NONTARGET = 1e14;

// Normalized base weights per category. Chosen so that the default ordering
// (Model Count > Excesses > Pollution > Power > Cost) with TIER_BASE=1e3 and
// 5 active non-deficiency tiers produces the original weight values exactly.
const BASE_MODEL_COUNT               = 1e-3;
const BASE_POLLUTION                 = 1e-5;
const BASE_POWER                     = 1e-8;
const BASE_COST                      = 1e-6;

// Each priority tier is TIER_BASE times more important than the tier below it
const TIER_BASE = 1e3;

/**
 * Compute objective weights from the user-defined active weight ordering.
 * Deficiency is always pinned at its constants above. The remaining active
 * weights receive exponential tier scaling based on position in the list:
 * top of list = highest tier = largest multiplier. Weights in unusedWeights
 * are disabled (scale = 0). The four Excesses sub-weights all share the same
 * tier scale, preserving their internal hierarchy.
 */
export const computeObjectiveWeights = (activeWeights = [], unusedWeights = []) => {
  const unusedSet = new Set(unusedWeights);
  const nonDeficiency = activeWeights.filter(w => w !== 'Deficiencies');
  const N = nonDeficiency.length;

  const tierScale = (label) => {
    if (unusedSet.has(label)) return 0;
    const idx = nonDeficiency.indexOf(label);
    if (idx === -1) return 0;
    return Math.pow(TIER_BASE, N - 1 - idx);
  };

  return {
    MODEL_COUNT_WEIGHT: BASE_MODEL_COUNT * tierScale('Model Count'),
    POLLUTION_WEIGHT:   BASE_POLLUTION   * tierScale('Pollution'),
    POWER_WEIGHT:       BASE_POWER       * tierScale('Power'),
    COST_WEIGHT:        BASE_COST        * tierScale('Cost'),
  };
};



// Cache the factory function only — createSCIP() must be called fresh each solve
// since callMain() can only be invoked once per Emscripten instance
let _createSCIP = null;

const getOrLoadSCIPFactory = async () => {
  if (_createSCIP) {
    return _createSCIP;
  }

  const scipUrl = import.meta.env.BASE_URL + 'scip.js';

  const response = await fetch(scipUrl);
  if (!response.ok) throw new Error(`Failed to fetch scip.js: ${response.status}`);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const scipModule = await import(/* @vite-ignore */ blobUrl);
  URL.revokeObjectURL(blobUrl);

  _createSCIP = scipModule.default;
  return _createSCIP;
};

/**
 * Execute a pre-built MPS string through SCIP WASM
 */
const runSCIP = async (mpsString, varNameMap, label = 'SCIP') => {
  const stdoutLines = [];
  const createSCIP = await getOrLoadSCIPFactory();
  const scip = await createSCIP({
    locateFile: (file) => import.meta.env.BASE_URL + file,
    print: (text) => { stdoutLines.push(text); },
    printErr: (text) => { stdoutLines.push(text); },
  });
  const { FS, callMain: main } = scip;
  FS.writeFile('model.mps', mpsString);
  main(['-c', 'read model.mps', '-c', 'optimize', '-c', 'display solution', '-c', 'quit']);
  const stdoutText = stdoutLines.join('\n');
  let solutionText;
  try {
    solutionText = FS.readFile('sol.txt', { encoding: 'utf8' });
  } catch (e) {
    solutionText = stdoutText;
  }
  return parseSCIPSolution(solutionText, varNameMap);
};

/**
 * Solve the MPS model using SCIP WASM
 */
const solveWithSCIP = async (graph, targetNodeIds, weights) => {
  try {
    const needsCeilVars = weights.COST_WEIGHT > 0 || weights.MODEL_COUNT_WEIGHT > 0;

    if (needsCeilVars) {
      // Phase 1: pure LP with cost/model count approximated on continuous m_ variables
      // This gives us tight per-node machine count bounds for the MILP phase
      const { mpsString: mps1, varNameMap: vm1, stats: s1 } = buildMPSString(graph, targetNodeIds, weights, null);
      console.log(`[SCIP Phase 1 LP] MPS size: ${(mps1.length / 1024).toFixed(1)} KB | rows: ${s1.rows} | binary: ${s1.binary} | integer: ${s1.integer} | continuous: ${s1.continuous}`);
      const phase1Result = await runSCIP(mps1, vm1);

      // Extract per-node LP values to build tight bounds — fall back to 0 if phase 1 failed
      const phaseBounds = new Map();
      Object.keys(graph.nodes).forEach(nodeId => {
        const val = phase1Result.feasible ? (phase1Result[`m_${nodeId}`] || 0) : 0;
        phaseBounds.set(nodeId, val);
      });

      // Phase 2: MILP with tight mc_ bounds derived from phase 1 LP solution
      const { mpsString: mps2, varNameMap: vm2, stats: s2 } = buildMPSString(graph, targetNodeIds, weights, phaseBounds);
      console.log(`[SCIP Phase 2 MILP] MPS size: ${(mps2.length / 1024).toFixed(1)} KB | rows: ${s2.rows} | binary: ${s2.binary} | integer: ${s2.integer} | continuous: ${s2.continuous}`);
      return await runSCIP(mps2, vm2);
    }

    // No ceil vars needed — single pure LP solve
    const { mpsString, varNameMap, stats } = buildMPSString(graph, targetNodeIds, weights, null);
    console.log(`[SCIP] MPS size: ${(mpsString.length / 1024).toFixed(1)} KB | rows: ${stats.rows} | binary: ${stats.binary} | integer: ${stats.integer} | continuous: ${stats.continuous}`);
    return await runSCIP(mpsString, varNameMap);

  } catch (error) {
    console.error('[SCIP Solver] Error:', error);
    console.error('[SCIP Solver] Error message:', error.message);
    console.error('[SCIP Solver] Error stack:', error.stack);
    return { feasible: false, error: error.message, stack: error.stack };
  }
};

/**
 * Build MPS format string directly from graph (full double precision)
 */
const buildMPSString = (graph, targetNodeIds = new Set(), weights = {}, phaseBounds = null) => {
  const variables = [];
  const varSet = new Set();
  const integerVars = new Set(); // mc_ general integers
  const binaryVars = new Set();  // indicator variables (0/1)
  const varNameMap = new Map();

  // Row storage: rowName -> { type: 'E'|'L'|'G', rhs: number, terms: Map(varName -> coeff) }
  const rowMap = new Map();
  const rowOrder = [];
  const objCoeffs = new Map(); // varName -> coeff

  const registerVar = (originalName, isInteger = false, isBinary = false) => {
    const sanitized = sanitizeVarName(originalName);
    if (!varSet.has(sanitized)) {
      varSet.add(sanitized);
      variables.push(sanitized);
      varNameMap.set(sanitized, originalName);
    }
    if (isInteger) integerVars.add(sanitized);
    if (isBinary) binaryVars.add(sanitized);
    return sanitized;
  };

  const addObjCoeff = (varName, coeff) => {
    if (coeff === 0) return;
    objCoeffs.set(varName, (objCoeffs.get(varName) || 0) + coeff);
  };

  const registerRow = (name, type, rhs = 0) => {
    const sanitized = sanitizeVarName(name);
    if (!rowMap.has(sanitized)) {
      rowMap.set(sanitized, { type, rhs, terms: new Map() });
      rowOrder.push(sanitized);
    }
    return sanitized;
  };

  const addRowTerm = (rowName, varName, coeff) => {
    if (coeff === 0) return;
    const row = rowMap.get(rowName);
    if (!row) return;
    row.terms.set(varName, (row.terms.get(varName) || 0) + coeff);
  };

  // terms: array of [varName, coeff] pairs
  const addConstraint = (name, terms, rhs, type) => {
    const mpsType = type === 'equal' ? 'E' : type === 'max' ? 'L' : 'G';
    const rowName = registerRow(name, mpsType, rhs);
    terms.forEach(([varName, coeff]) => addRowTerm(rowName, varName, coeff));
  };

  // Full precision number formatter — MPS supports full doubles unlike LP format
  const fmt = (n) => String(n);

  // Flags to skip unused variable types entirely from the MPS model
  const useModelCount = weights.MODEL_COUNT_WEIGHT > 0;
  const mcUpperBounds = new Map(); // mcVarName -> tight upper bound from phase 1

  // ===== Machine count variables =====
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const varName = registerVar(`m_${nodeId}`);
    const currentCount = node.machineCount || 0;
    const machineCountMode = node.machineCountMode || 'free';
    const cappedCount = node.cappedMachineCount;

    let cycleTime = node.cycleTime;
    if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;

    const power = node.recipe.power_consumption;
    let powerValue = 0;
    if (typeof power === 'number') {
      powerValue = power;
    } else if (typeof power === 'object' && power !== null && 'max' in power) {
      powerValue = power.max;
    }

    const pollution = node.recipe.pollution;
    const pollutionValue = typeof pollution === 'number' ? pollution : 0;

    const machine = getMachine(node.recipe.machine_id);
    const machineCost = machine && typeof machine.cost === 'number' ? machine.cost : 0;

    const inputOutputCount = (node.recipe.inputs?.length || 0) + (node.recipe.outputs?.length || 0);
    const powerFactor = node.recipe.power_type === 'HV' ? 2 : Math.ceil(powerValue / 1500000) * 2;

    let modelCountPerMachine;
    if (node.recipe.machine_id === 'm_industrial_firebox') {
      modelCountPerMachine = 1 + inputOutputCount * 2;
    } else if (node.recipe.isTreeFarm && node.recipe.treeFarmSettings) {
      const { trees, harvesters, sprinklers, controller, outputs } = node.recipe.treeFarmSettings;
      const waterTanks = Math.ceil(sprinklers / 3);
      modelCountPerMachine = trees + harvesters + sprinklers + (waterTanks * 3) + controller + (outputs * 3) + powerFactor;
    } else {
      modelCountPerMachine = 1 + powerFactor + (inputOutputCount * 2);
    }

    // Continuous costs — scale with actual fractional machine count
    const continuousObjCoeff =
      (weights.POWER_WEIGHT * powerValue) +
      (weights.POLLUTION_WEIGHT * pollutionValue);
    if (continuousObjCoeff !== 0) addObjCoeff(varName, continuousObjCoeff);

    const wantsCeilVar = weights.COST_WEIGHT > 0 || useModelCount;
    if (wantsCeilVar) {
      const approxObjCoeff =
        (weights.COST_WEIGHT * machineCost) +
        (useModelCount ? weights.MODEL_COUNT_WEIGHT * modelCountPerMachine : 0);

      if (phaseBounds !== null) {
        const lpValue = phaseBounds.get(nodeId) || 0;
        const ceilValue = Math.ceil(lpValue);

        if (lpValue > 1000) {
          // Large machine counts — integer precision negligible, use continuous approximation
          if (approxObjCoeff !== 0) addObjCoeff(varName, approxObjCoeff);
          console.log(`[SCIP Phase 2] mc_${nodeId}: continuous fallback (lpValue=${lpValue.toFixed(4)})`);
        } else {
          const mcVarName = registerVar(`mc_${nodeId}`, true);
          addConstraint(`ceil_${nodeId}`, [[mcVarName, 1], [varName, -1]], 0, 'min');
          const buffer = Math.max(2, Math.ceil(lpValue * 0.5));
          const mcLower = ceilValue;
          const mcUpper = ceilValue + buffer;
          mcUpperBounds.set(mcVarName, { lower: mcLower, upper: mcUpper });
          if (approxObjCoeff !== 0) addObjCoeff(mcVarName, approxObjCoeff);
          console.log(`[SCIP Phase 2] mc_${nodeId}: [${mcLower}, ${mcUpper}] (lpValue=${lpValue.toFixed(4)}, buffer=${buffer})`);
        }
      } else {
        // Phase 1: approximate on continuous m_ so LP solution is meaningful
        if (approxObjCoeff !== 0) addObjCoeff(varName, approxObjCoeff);
      }
    }

    if (machineCountMode === 'locked') {
      addConstraint(`lock_${nodeId}`, [[varName, 1]], currentCount, 'equal');
    } else if (machineCountMode === 'capped' && typeof cappedCount === 'number') {
      addConstraint(`cap_${nodeId}`, [[varName, 1]], cappedCount, 'max');
    }
  });

  // ===== Flow variables =====
  graph.connections.forEach(conn => {
    registerVar(`f_${conn.id}`);
  });

  // ===== Pre-index connections for O(1) lookup =====
  const outgoingByOutput = new Map(); // `nodeId:outputIndex` -> [connections]
  const incomingByInput = new Map();  // `nodeId:inputIndex` -> [connections]
  graph.connections.forEach(conn => {
    const outKey = `${conn.sourceNodeId}:${conn.sourceOutputIndex}`;
    if (!outgoingByOutput.has(outKey)) outgoingByOutput.set(outKey, []);
    outgoingByOutput.get(outKey).push(conn);
    const inKey = `${conn.targetNodeId}:${conn.targetInputIndex}`;
    if (!incomingByInput.has(inKey)) incomingByInput.set(inKey, []);
    incomingByInput.get(inKey).push(conn);
  });

  // ===== Flow conservation constraints =====
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const isTargetNode = targetNodeIds.has(nodeId);
    const mVar = sanitizeVarName(`m_${nodeId}`);

    // Output flow conservation
    node.outputs.forEach((output, outputIndex) => {
      const outgoingConnections = outgoingByOutput.get(`${nodeId}:${outputIndex}`) || [];

      // Skip unconnected outputs on non-target nodes — no constraint needed,
      // m_ is already driven by deficit constraints on the input side.
      if (!isTargetNode && outgoingConnections.length === 0) return;

      const slackVar = registerVar(`excess_${nodeId}_${outputIndex}`);

      if (isTargetNode) {
        addObjCoeff(slackVar, 1);
      }

      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;

      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      if (typeof quantity !== 'number') return;

      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;

      // Flow conservation: rate * m_ - sum(f_out) - excess = 0
      const flowTerms = [[mVar, ratePerMachine], [slackVar, -1]];
      outgoingConnections.forEach(conn => {
        flowTerms.push([sanitizeVarName(`f_${conn.id}`), -1]);
      });
      addConstraint(`flow_out_${nodeId}_${outputIndex}`, flowTerms, 0, 'equal');
    });

    // Input flow conservation
    node.inputs.forEach((input, inputIndex) => {
      const incomingConnections = incomingByInput.get(`${nodeId}:${inputIndex}`) || [];
      if (incomingConnections.length === 0) return;

      const slackVar = registerVar(`deficit_${nodeId}_${inputIndex}`);
      const deficitIndicatorVar = isTargetNode
        ? registerVar(`deficit_indicator_${nodeId}_${inputIndex}`, false, true)
        : null;

      addObjCoeff(slackVar, isTargetNode ? DEFICIENCY_AMOUNT_WEIGHT : DEFICIENCY_AMOUNT_WEIGHT_NONTARGET);
      if (isTargetNode) addObjCoeff(deficitIndicatorVar, DEFICIENCY_COUNT_WEIGHT);

      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;

      const quantity = input.quantity;
      if (typeof quantity !== 'number') return;

      const ratePerMachine = node.isMineshaftDrill ?
        quantity : quantity / cycleTime;

      if (isTargetNode) {
        const M_deficit = ratePerMachine * 10000;
        addConstraint(`deficit_link_${nodeId}_${inputIndex}`,
          [[slackVar, 1], [deficitIndicatorVar, -M_deficit]], 0, 'max');
      }

      // Flow conservation equality: sum(f_in) + deficit = rate * m_
      // Replaces the previous G + L pair — mathematically equivalent since deficit >= 0
      // and the objective minimizes deficit, making the equality tighter and faster to solve.
      const flowInTerms = [[slackVar, 1], [mVar, -ratePerMachine]];
      incomingConnections.forEach(conn => {
        flowInTerms.push([sanitizeVarName(`f_${conn.id}`), 1]);
      });
      addConstraint(`flow_in_${nodeId}_${inputIndex}`, flowInTerms, 0, 'equal');
    });
  });

  // ===== Minimum excess constraints for target nodes =====
  targetNodeIds.forEach(nodeId => {
    const node = graph.nodes[nodeId];
    if (!node) return;

    node.outputs.forEach((output, outputIndex) => {
      const slackVar = sanitizeVarName(`excess_${nodeId}_${outputIndex}`);

      const outgoingConnections = outgoingByOutput.get(`${nodeId}:${outputIndex}`) || [];

      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;

      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      if (typeof quantity !== 'number') return;

      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      const currentProduction = ratePerMachine * (node.machineCount || 0);

      let currentConnectedFlow = 0;
      outgoingConnections.forEach(conn => {
        const targetNode = graph.nodes[conn.targetNodeId];
        if (!targetNode) return;
        const targetInput = targetNode.inputs[conn.targetInputIndex];
        if (!targetInput) return;
        let targetCycleTime = targetNode.cycleTime;
        if (typeof targetCycleTime !== 'number' || targetCycleTime <= 0) targetCycleTime = 1;
        const targetQuantity = targetInput.quantity;
        if (typeof targetQuantity !== 'number') return;
        const targetRatePerMachine = targetNode.isMineshaftDrill ? targetQuantity : targetQuantity / targetCycleTime;
        const targetDemand = targetRatePerMachine * (targetNode.machineCount || 0);
        currentConnectedFlow += Math.min(currentProduction - currentConnectedFlow, targetDemand);
      });

      const currentExcess = Math.max(0, currentProduction - currentConnectedFlow);
      addConstraint(`min_excess_${nodeId}_${outputIndex}`, [[slackVar, 1]], currentExcess, 'min');
    });
  });

  // ===== Build MPS string =====

  // Build column -> [(rowName, coeff)] mapping directly to avoid a full matrix copy.
  // We iterate rows once to populate per-variable entry lists on demand.
  const colEntries = new Map();
  const getColEntries = (v) => {
    if (!colEntries.has(v)) colEntries.set(v, []);
    return colEntries.get(v);
  };

  objCoeffs.forEach((coeff, varName) => {
    if (coeff !== 0) getColEntries(varName).push(['obj', coeff]);
  });

  rowOrder.forEach(rowName => {
    const row = rowMap.get(rowName);
    row.terms.forEach((coeff, varName) => {
      if (coeff !== 0) getColEntries(varName).push([rowName, coeff]);
    });
  });

  // Separate variable types
  const continuousVars = variables.filter(v => !integerVars.has(v) && !binaryVars.has(v));
  const generalIntVars = variables.filter(v => integerVars.has(v) && !binaryVars.has(v));
  const binaryVarsList = variables.filter(v => binaryVars.has(v));

  const out = ['NAME          MODEL\n'];

  out.push('ROWS\n');
  out.push(' N  obj\n');
  rowOrder.forEach(rowName => {
    out.push(` ${rowMap.get(rowName).type}  ${rowName}\n`);
  });

  out.push('COLUMNS\n');

  const writeVarEntries = (varName) => {
    const entries = colEntries.get(varName) || [];
    if (entries.length === 0) {
      out.push(`    ${varName}  obj  0\n`);
      return;
    }
    entries.forEach(([rowName, coeff]) => {
      out.push(`    ${varName}  ${rowName}  ${fmt(coeff)}\n`);
    });
  };

  continuousVars.forEach(v => writeVarEntries(v));
  binaryVarsList.forEach(v => writeVarEntries(v));

  if (generalIntVars.length > 0) {
    out.push("    INT1      'MARKER'                 'INTORG'\n");
    generalIntVars.forEach(v => writeVarEntries(v));
    out.push("    INT1END   'MARKER'                 'INTEND'\n");
  }

  out.push('RHS\n');
  rowOrder.forEach(rowName => {
    const row = rowMap.get(rowName);
    if (row.rhs !== 0) {
      out.push(`    RHS  ${rowName}  ${fmt(row.rhs)}\n`);
    }
  });

  // Free rowMap now that RHS section is done
  rowMap.clear();

  out.push('BOUNDS\n');
  // Per-node tight bounds from phase 1 LP solution — LO and UP only, never FX
  generalIntVars.forEach(varName => {
    const info = mcUpperBounds.get(varName);
    if (info) {
      out.push(` LO BND  ${varName}  ${info.lower}\n`);
      out.push(` UP BND  ${varName}  ${info.upper}\n`);
    } else {
      out.push(` UP BND  ${varName}  1000000\n`);
    }
  });
  // Binary indicators
  binaryVarsList.forEach(varName => {
    out.push(` BV BND  ${varName}\n`);
  });

  out.push('ENDATA\n');

  return {
    mpsString: out.join(''),
    varNameMap,
    stats: {
      binary: binaryVarsList.length,
      integer: generalIntVars.length,
      continuous: continuousVars.length,
      rows: rowOrder.length,
    }
  };
};

/**
 * Parse SCIP solution file text output
 */
const parseSCIPSolution = (solutionText, varNameMap) => {

  if (!solutionText ||
      solutionText.includes('no solution available') ||
      solutionText.includes('infeasible')) {
    return { feasible: false };
  }

  if (!solutionText.includes('optimal solution found') &&
      !solutionText.includes('solution status: feasible')) {
    return { feasible: false };
  }

  const solution = { feasible: true };
  const lines = solutionText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('solution status') || trimmed.startsWith('objective value')) continue;

    // Match: varname  value  (optional trailing content)
    const match = trimmed.match(/^(\S+)\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
    if (!match) continue;

    const sanitizedName = match[1];
    const value = parseFloat(match[2]);
    if (isNaN(value)) continue;

    const originalName = varNameMap.get(sanitizedName);
    if (originalName) {
      solution[originalName] = value;
    }
  }

  return solution;
};

/**
 * Raw MPS solver — accepts a pre-built MPS string and varNameMap.
 * Used by autoCompleter to reuse the SCIP infrastructure without the graph layer.
 */
export const solveMPSRaw = async (mpsString, varNameMap) => {
  try {
    const stdoutLines = [];
    const createSCIP = await getOrLoadSCIPFactory();
    const scip = await createSCIP({
      locateFile: (file) => import.meta.env.BASE_URL + file,
      print: (text) => { stdoutLines.push(text); },
      printErr: (text) => { stdoutLines.push(text); },
    });
    const { FS, callMain: main } = scip;
    console.log(`[SCIP AutoComplete] MPS size: ${(mpsString.length / 1024).toFixed(1)} KB`);
    FS.writeFile('model.mps', mpsString);
    main(['-c', 'read model.mps', '-c', 'optimize', '-c', 'display solution', '-c', 'quit']);
    const stdoutText = stdoutLines.join('\n');
    let solutionText;
    try {
      solutionText = FS.readFile('sol.txt', { encoding: 'utf8' });
    } catch (e) {
      solutionText = stdoutText;
    }
    return parseSCIPSolution(solutionText, varNameMap);
  } catch (error) {
    console.error('[SCIP AutoComplete] Error:', error);
    return { feasible: false, error: error.message };
  }
};

/**
 * Solve the full graph LP model
 */
const solveFullGraph = async (graph, targetNodeIds = new Set(), activeWeights = [], unusedWeights = []) => {
  // Solve the model
  const solveStartTime = performance.now();
  
  // Compute objective weights from user ordering, then solve
  const weights = computeObjectiveWeights(activeWeights, unusedWeights);
  const result = await solveWithSCIP(graph, targetNodeIds, weights);
  
  const solveEndTime = performance.now();
  const solveTime = solveEndTime - solveStartTime;
  
  return result;
};

/**
 * Extract machine count updates from LP solution
 */
const extractMachineUpdates = (lpResult, graph) => {
  const updates = new Map();
  
  if (!lpResult.feasible || lpResult.unsustainableLoops) {
    return updates;
  }
  
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const varName = `m_${nodeId}`;
    const newCount = lpResult[varName] !== undefined ? lpResult[varName] : 0;
    const currentCount = node.machineCount || 0;
    
    if (newCount >= -EPSILON) {
      const finalCount = Math.max(0, newCount);
      
      if (Math.abs(finalCount - currentCount) > EPSILON) {
        updates.set(nodeId, finalCount);
      }
    }
  });
  
  return updates;
};

/**
 * Main compute function - adjusts machine counts to balance production
 */
export const computeMachines = async (nodes, edges, targetProducts, options = {}) => {
  const { allowDeficiency = false, activeWeights = [], unusedWeights = [] } = options;
  if (targetProducts.length === 0) {
    return {
      success: false,
      updates: new Map(),
      converged: false,
      iterations: 0,
      message: 'No target recipes selected'
    };
  }

  // Build graph
  const graph = buildProductionGraph(nodes, edges);
  const targetNodeIds = new Set(targetProducts.map(t => t.recipeBoxId));
  
  // Solve with LP
  const lpResult = await solveFullGraph(graph, targetNodeIds, activeWeights, unusedWeights);
  
  if (!lpResult.feasible) {
    const errorMsg = lpResult.error
      ? `Solver error: ${lpResult.error}`
      : 'No feasible solution found — the model is infeasible given the current constraints.';
    return {
      success: false,
      updates: new Map(),
      converged: false,
      iterations: 0,
      message: errorMsg,
      solverError: !!lpResult.error,
      errorDetail: lpResult.error || null
    };
  }
  
  // Check for deficiency in solution
  let hasDeficiency = false;
  const deficientNodes = [];
  
  Object.keys(lpResult).forEach(key => {
    if (key.startsWith('deficit_') && !key.includes('indicator')) {
      const deficitAmount = lpResult[key] || 0;
      const parts = key.split('_');
      const inputIndex = parseInt(parts[parts.length - 1]);
      const nodeId = parts.slice(1, -1).join('_');
      const node = graph.nodes[nodeId];
      const rate = node?.inputs?.[inputIndex]?.quantity;
      const relativeThreshold = typeof rate === 'number' && rate > 0 ? rate * 1e-6 : EPSILON;
      if (deficitAmount > relativeThreshold) {
        hasDeficiency = true;
        if (node) {
          const input = node.inputs[inputIndex];
          deficientNodes.push({
            nodeId,
            nodeName: node.recipe?.name || nodeId,
            inputIndex,
            productId: input?.productId,
            deficitAmount
          });
        }
      }
    }
  });
  
  if (hasDeficiency && !allowDeficiency) {
    const deficiencyDetails = deficientNodes.map(d => 
      `  ${d.nodeName}: needs ${d.deficitAmount.toFixed(4)}/s more of product ${d.productId}`
    ).join('\n');
    
    return {
      success: false,
      updates: new Map(),
      converged: false,
      iterations: 1,
      message: `Cannot balance production - insufficient input supply detected:\n${deficiencyDetails}\n\nThis usually means a loop consumes more than it produces.`,
      hasDeficiency: true,
      deficientNodes
    };
  }
  
  // Extract updates
  const updates = extractMachineUpdates(lpResult, graph);
  
  return {
    success: updates.size > 0,
    updates,
    converged: true,
    iterations: 1,
    message: updates.size > 0 ? `Updated ${updates.size} nodes` : 'Network already balanced'
  };
};