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

// Objective weights (in strict priority order)
// Priority tiers (each tier dominates all lower tiers):
// Tier 1 (Critical): Deficiency count and amounts - MUST be zero
// Tier 2 (Important): Model count, excess counts and amounts - should be minimized
// Tier 3 (Optional): Pollution, power, cost - nice to minimize but low priority

// Tier 1: Deficiency (must dominate everything)
const DEFICIENCY_COUNT_WEIGHT = 1e15;      // 1 quadrillion - count of deficient inputs (range: 1-3)
const DEFICIENCY_AMOUNT_WEIGHT = 1e12;     // 1 trillion - amount of each deficiency (range: varies widely)

// Tier 2: Model count and excess (should dominate tier 3)
const MODEL_COUNT_WEIGHT = 1e9;            // 1 billion - model count per machine (range: 3-20, uses ceiling)
const CONNECTED_EXCESS_COUNT_WEIGHT = 1e6; // 1 million - count of connected excess outputs (range: 1-3)
const CONNECTED_EXCESS_AMOUNT_WEIGHT = 1e3;// 1 thousand - amount of connected excess (range: varies)
const UNCONNECTED_EXCESS_COUNT_WEIGHT = 1e5;// 100 thousand - count of unconnected excess (range: 1-3)
const UNCONNECTED_EXCESS_AMOUNT_WEIGHT = 1e2;// 100 - amount of unconnected excess (range: varies)

// Tier 3: Resource optimization (lowest priority)
const POLLUTION_WEIGHT = 10;               // 10 - pollution per machine (range: 0.01-0.4, scales with machine count)
const POWER_WEIGHT = 0.00001;              // 0.00001 - power per machine (range: 150-20M, scales with machine count)
const COST_WEIGHT = 0.000001;              // 0.000001 - cost per machine (range: 80-200M, but mostly 1k-250k)



// Cache the factory function only — createSCIP() must be called fresh each solve
// since callMain() can only be invoked once per Emscripten instance
let _createSCIP = null;

const getOrLoadSCIPFactory = async () => {
  if (_createSCIP) {
    console.log('[SCIP Solver] Reusing cached SCIP factory');
    return _createSCIP;
  }

  console.log('[SCIP Solver] Loading SCIP module...');
  const scipUrl = import.meta.env.BASE_URL + 'scip.js';
  console.log('[SCIP Solver] Loading from:', scipUrl);

  const response = await fetch(scipUrl);
  if (!response.ok) throw new Error(`Failed to fetch scip.js: ${response.status}`);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const scipModule = await import(/* @vite-ignore */ blobUrl);
  URL.revokeObjectURL(blobUrl);

  _createSCIP = scipModule.default;
  console.log('[SCIP Solver] SCIP factory cached');
  return _createSCIP;
};

/**
 * Solve the MPS model using SCIP WASM
 */
const solveWithSCIP = async (graph, targetNodeIds) => {
  try {
    const stdoutLines = [];
    const createSCIP = await getOrLoadSCIPFactory();

    const scip = await createSCIP({
      locateFile: (file) => import.meta.env.BASE_URL + file,
      print: (text) => { stdoutLines.push(text); },
      printErr: (text) => { stdoutLines.push(text); },
    });

    const { FS, callMain: main } = scip;

    console.log('[SCIP Solver] Building MPS model...');
    const { mpsString, varNameMap } = buildMPSString(graph, targetNodeIds);
    console.log('[SCIP Solver] MPS model length:', mpsString.length);

    FS.writeFile('model.mps', mpsString);

    console.log('[SCIP Solver] Solving...');
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
    console.error('[SCIP Solver] Error:', error);
    console.error('[SCIP Solver] Error message:', error.message);
    console.error('[SCIP Solver] Error stack:', error.stack);
    return { feasible: false, error: error.message, stack: error.stack };
  }
};

/**
 * Build MPS format string directly from graph (full double precision)
 */
const buildMPSString = (graph, targetNodeIds = new Set()) => {
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

  // ===== Machine count variables =====
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const varName = registerVar(`m_${nodeId}`);
    const ceilingVarName = registerVar(`mc_${nodeId}`, true); // general integer
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

    const machineObjCoeff = (POWER_WEIGHT * powerValue) + (POLLUTION_WEIGHT * pollutionValue) + (COST_WEIGHT * machineCost);
    if (machineObjCoeff !== 0) addObjCoeff(varName, machineObjCoeff);
    addObjCoeff(ceilingVarName, MODEL_COUNT_WEIGHT * modelCountPerMachine);

    // Ceiling constraint: mc_ - m_ >= 0
    addConstraint(`ceiling_${nodeId}`, [[ceilingVarName, 1], [varName, -1]], 0, 'min');

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

  // ===== Excess indicator variables (binary) =====
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    node.outputs.forEach((output, outputIndex) => {
      const excessIndicatorVar = registerVar(`excess_indicator_${nodeId}_${outputIndex}`, false, true);

      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );
      const hasConnections = outgoingConnections.length > 0;
      const excessCountWeight = hasConnections ? CONNECTED_EXCESS_COUNT_WEIGHT : UNCONNECTED_EXCESS_COUNT_WEIGHT;
      addObjCoeff(excessIndicatorVar, excessCountWeight);
    });
  });

  // ===== Flow conservation constraints =====
  Object.keys(graph.nodes).forEach(nodeId => {
    const node = graph.nodes[nodeId];
    const isTargetNode = targetNodeIds.has(nodeId);
    const mVar = sanitizeVarName(`m_${nodeId}`);

    // Output flow conservation
    node.outputs.forEach((output, outputIndex) => {
      const slackVar = registerVar(`excess_${nodeId}_${outputIndex}`);
      const excessIndicatorVar = sanitizeVarName(`excess_indicator_${nodeId}_${outputIndex}`);

      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );

      const hasConnections = outgoingConnections.length > 0;
      const excessAmountWeight = hasConnections ? CONNECTED_EXCESS_AMOUNT_WEIGHT : UNCONNECTED_EXCESS_AMOUNT_WEIGHT;
      addObjCoeff(slackVar, isTargetNode ? 1 : excessAmountWeight);

      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;

      const quantity = output.originalQuantity !== undefined ? output.originalQuantity : output.quantity;
      if (typeof quantity !== 'number') return;

      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      const M = ratePerMachine * 10000;

      // Link constraint: excess - M * indicator <= 0
      addConstraint(`link_excess_${nodeId}_${outputIndex}`,
        [[slackVar, 1], [excessIndicatorVar, -M]], 0, 'max');

      // Flow conservation: rate * m_ - sum(f_out) - excess = 0
      const flowTerms = [[mVar, ratePerMachine], [slackVar, -1]];
      outgoingConnections.forEach(conn => {
        flowTerms.push([sanitizeVarName(`f_${conn.id}`), -1]);
      });
      addConstraint(`flow_out_${nodeId}_${outputIndex}`, flowTerms, 0, 'equal');
    });

    // Input flow conservation
    node.inputs.forEach((input, inputIndex) => {
      const incomingConnections = graph.connections.filter(
        c => c.targetNodeId === nodeId && c.targetInputIndex === inputIndex
      );
      if (incomingConnections.length === 0) return;

      const slackVar = registerVar(`deficit_${nodeId}_${inputIndex}`);
      const deficitIndicatorVar = registerVar(`deficit_indicator_${nodeId}_${inputIndex}`, false, true);

      addObjCoeff(slackVar, DEFICIENCY_AMOUNT_WEIGHT);
      addObjCoeff(deficitIndicatorVar, DEFICIENCY_COUNT_WEIGHT);

      let cycleTime = node.cycleTime;
      if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;

      const quantity = input.quantity;
      if (typeof quantity !== 'number') return;

      const ratePerMachine = node.isMineshaftDrill ? quantity : quantity / cycleTime;
      const M_deficit = ratePerMachine * 10000;

      // Link deficit to indicator: deficit - M * indicator <= 0
      addConstraint(`deficit_link_${nodeId}_${inputIndex}`,
        [[slackVar, 1], [deficitIndicatorVar, -M_deficit]], 0, 'max');

      // Flow conservation: sum(f_in) + deficit - rate * m_ >= 0
      const flowInTerms = [[slackVar, 1], [mVar, -ratePerMachine]];
      incomingConnections.forEach(conn => {
        flowInTerms.push([sanitizeVarName(`f_${conn.id}`), 1]);
      });
      addConstraint(`flow_in_${nodeId}_${inputIndex}`, flowInTerms, 0, 'min');

      // Max flow constraint: sum(f_in) - rate * m_ <= 0
      const maxFlowTerms = [[mVar, -ratePerMachine]];
      incomingConnections.forEach(conn => {
        maxFlowTerms.push([sanitizeVarName(`f_${conn.id}`), 1]);
      });
      addConstraint(`max_flow_in_${nodeId}_${inputIndex}`, maxFlowTerms, 0, 'max');
    });
  });

  // ===== Minimum excess constraints for target nodes =====
  targetNodeIds.forEach(nodeId => {
    const node = graph.nodes[nodeId];
    if (!node) return;

    node.outputs.forEach((output, outputIndex) => {
      const slackVar = sanitizeVarName(`excess_${nodeId}_${outputIndex}`);

      const outgoingConnections = graph.connections.filter(
        c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
      );

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

  // Build column -> [(rowName, coeff)] mapping
  const colEntries = new Map();
  variables.forEach(v => colEntries.set(v, []));

  objCoeffs.forEach((coeff, varName) => {
    if (coeff !== 0) colEntries.get(varName)?.push(['obj', coeff]);
  });

  rowOrder.forEach(rowName => {
    const row = rowMap.get(rowName);
    row.terms.forEach((coeff, varName) => {
      if (coeff !== 0) colEntries.get(varName)?.push([rowName, coeff]);
    });
  });

  // Separate variable types
  const continuousVars = variables.filter(v => !integerVars.has(v) && !binaryVars.has(v));
  const generalIntVars = variables.filter(v => integerVars.has(v) && !binaryVars.has(v));
  const binaryVarsList = variables.filter(v => binaryVars.has(v));

  const writeVarEntries = (varName, mpsStr) => {
    const entries = colEntries.get(varName) || [];
    if (entries.length === 0) {
      return mpsStr + `    ${varName}  obj  0\n`;
    }
    entries.forEach(([rowName, coeff]) => {
      mpsStr += `    ${varName}  ${rowName}  ${fmt(coeff)}\n`;
    });
    return mpsStr;
  };

  let mps = 'NAME          MODEL\n';

  mps += 'ROWS\n';
  mps += ' N  obj\n';
  rowOrder.forEach(rowName => {
    mps += ` ${rowMap.get(rowName).type}  ${rowName}\n`;
  });

  mps += 'COLUMNS\n';

  continuousVars.forEach(v => { mps = writeVarEntries(v, mps); });
  binaryVarsList.forEach(v => { mps = writeVarEntries(v, mps); });

  if (generalIntVars.length > 0) {
    mps += "    INT1      'MARKER'                 'INTORG'\n";
    generalIntVars.forEach(v => { mps = writeVarEntries(v, mps); });
    mps += "    INT1END   'MARKER'                 'INTEND'\n";
  }

  mps += 'RHS\n';
  rowOrder.forEach(rowName => {
    const row = rowMap.get(rowName);
    if (row.rhs !== 0) {
      mps += `    RHS  ${rowName}  ${fmt(row.rhs)}\n`;
    }
  });

  mps += 'BOUNDS\n';
  // General integers need explicit upper bound or MPS defaults them to [0,1] (binary)
  generalIntVars.forEach(varName => {
    mps += ` UP BND  ${varName}  1000000\n`;
  });
  // Binary indicators
  binaryVarsList.forEach(varName => {
    mps += ` BV BND  ${varName}\n`;
  });

  mps += 'ENDATA\n';

  return { mpsString: mps, varNameMap };
};

/**
 * Parse SCIP solution file text output
 */
const parseSCIPSolution = (solutionText, varNameMap) => {
  console.log('[SCIP Solver] Parsing solution...');

  if (!solutionText ||
      solutionText.includes('no solution available') ||
      solutionText.includes('infeasible')) {
    console.log('[SCIP Solver] No feasible solution found');
    return { feasible: false };
  }

  if (!solutionText.includes('optimal solution found') &&
      !solutionText.includes('solution status: feasible')) {
    console.log('[SCIP Solver] Solution not optimal, text:', solutionText.substring(0, 200));
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

  console.log('[SCIP Solver] Parsed variables:', Object.keys(solution).length - 1);
  return solution;
};

/**
 * Solve the full graph LP model
 */
const solveFullGraph = async (graph, targetNodeIds = new Set()) => {
  const numNodes = Object.keys(graph.nodes).length;
  const numConnections = graph.connections.length;
  
  console.log('%c[LP Solver] Model Statistics:', 'color: #3498db; font-weight: bold');
  console.log(`  Graph: ${numNodes} nodes, ${numConnections} connections`);
  
  // Solve the model
  console.log('%c[LP Solver] Solving...', 'color: #f39c12; font-weight: bold');
  const solveStartTime = performance.now();
  
  // Build MPS model and solve with SCIP
  const result = await solveWithSCIP(graph, targetNodeIds);
  
  const solveEndTime = performance.now();
  const solveTime = solveEndTime - solveStartTime;
  
  if (result.feasible) {
    console.log(`%c[LP Solver] Solution found in ${solveTime.toFixed(2)}ms`, 'color: #2ecc71; font-weight: bold');
    console.log('%c[LP Solver] Solution Found', 'color: #2ecc71; font-weight: bold');
    
    // Calculate actual objective value manually
    let actualCost = 0;
    let deficiencyCountCost = 0;
    let deficiencyAmountCost = 0;
    let excessCountCost = 0;
    let excessAmountCost = 0;
    let modelCountCost = 0;
    let powerCost = 0;
    let pollutionCost = 0;
    let machineCost = 0;
    
    let totalDeficitCount = 0;
    let totalDeficitAmount = 0;
    let totalExcessCount = 0;
    let totalConnectedExcess = 0;
    let totalUnconnectedExcess = 0;
    let totalModelCount = 0;
    let totalPower = 0;
    let totalPollution = 0;
    let totalMachineCost = 0;
    
    Object.keys(result).forEach(key => {
      if (key.startsWith('deficit_indicator_')) {
        const value = result[key] || 0;
        if (value > EPSILON) {
          totalDeficitCount += value;
          deficiencyCountCost += value * DEFICIENCY_COUNT_WEIGHT;
        }
      }
      if (key.startsWith('deficit_') && !key.includes('indicator')) {
        const value = result[key] || 0;
        if (value > EPSILON) {
          totalDeficitAmount += value;
          deficiencyAmountCost += value * DEFICIENCY_AMOUNT_WEIGHT;
        }
      }
      if (key.startsWith('excess_indicator_')) {
        const value = result[key] || 0;
        if (value > EPSILON) {
          const parts = key.split('_');
          const nodeId = parts.slice(2, -1).join('_');
          const outputIndex = parseInt(parts[parts.length - 1]);
          
          const hasConnections = graph.connections.some(
            c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
          );
          
          const countWeight = hasConnections ? CONNECTED_EXCESS_COUNT_WEIGHT : UNCONNECTED_EXCESS_COUNT_WEIGHT;
          
          totalExcessCount += value;
          excessCountCost += value * countWeight;
        }
      }
      if (key.startsWith('excess_') && !key.includes('indicator')) {
        const value = result[key] || 0;
        
        if (value > EPSILON) {
          const parts = key.split('_');
          const nodeId = parts.slice(1, -1).join('_');
          const outputIndex = parseInt(parts[parts.length - 1]);
          
          const hasConnections = graph.connections.some(
            c => c.sourceNodeId === nodeId && c.sourceOutputIndex === outputIndex
          );
          
          const weight = hasConnections ? CONNECTED_EXCESS_AMOUNT_WEIGHT : UNCONNECTED_EXCESS_AMOUNT_WEIGHT;
          
          if (hasConnections) {
            totalConnectedExcess += value;
          } else {
            totalUnconnectedExcess += value;
          }
          
          excessAmountCost += value * weight;
        }
      }
      if (key.startsWith('m_')) {
        const nodeId = key.substring(2);
        const node = graph.nodes[nodeId];
        const value = result[key] || 0;
        
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
        const machineCostValue = machine && typeof machine.cost === 'number' ? machine.cost : 0;
        
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
        
        const ceilingVarName = `mc_${nodeId}`;
        const roundedMachineCount = result[ceilingVarName] !== undefined ? result[ceilingVarName] : Math.ceil(value);
        const nodeModelCount = roundedMachineCount * modelCountPerMachine;
        const nodePower = value * powerValue;
        const nodePollution = value * pollutionValue;
        const nodeMachineCost = roundedMachineCount * machineCostValue;
        
        totalModelCount += nodeModelCount;
        totalPower += nodePower;
        totalPollution += nodePollution;
        totalMachineCost += nodeMachineCost;
        
        modelCountCost += nodeModelCount * MODEL_COUNT_WEIGHT;
        powerCost += nodePower * POWER_WEIGHT;
        pollutionCost += nodePollution * POLLUTION_WEIGHT;
        machineCost += nodeMachineCost * COST_WEIGHT;
      }
    });
    
    actualCost = deficiencyCountCost + deficiencyAmountCost + excessCountCost + excessAmountCost + modelCountCost + powerCost + pollutionCost + machineCost;
    
    // Cost breakdown
    console.log('  Cost Breakdown:');
    console.log(`    Deficiency count: ${totalDeficitCount} inputs (cost: ${deficiencyCountCost.toExponential(2)})`);
    console.log(`    Deficiency amount: ${totalDeficitAmount.toFixed(4)} (cost: ${deficiencyAmountCost.toExponential(2)})`);
    console.log(`    Excess count: ${totalExcessCount} outputs (cost: ${excessCountCost.toExponential(2)})`);
    console.log(`    Connected excess: ${totalConnectedExcess.toFixed(4)} (cost: ${(totalConnectedExcess * CONNECTED_EXCESS_AMOUNT_WEIGHT).toExponential(2)})`);
    console.log(`    Unconnected excess: ${totalUnconnectedExcess.toFixed(4)} (cost: ${(totalUnconnectedExcess * UNCONNECTED_EXCESS_AMOUNT_WEIGHT).toExponential(2)})`);
    console.log(`    Model count: ${totalModelCount.toFixed(0)} (cost: ${modelCountCost.toExponential(2)})`);
    console.log(`    Power: ${totalPower.toFixed(0)} W (cost: ${powerCost.toFixed(2)})`);
    console.log(`    Pollution: ${totalPollution.toFixed(2)} %/hr (cost: ${pollutionCost.toFixed(2)})`);
    console.log(`    Machine cost: $${totalMachineCost.toFixed(0)} (cost: ${machineCost.toFixed(2)})`);
    console.log(`    Total: ${actualCost.toExponential(2)}`);
    
    // Show changed machine counts only
    console.log('  Machine Count Changes:');
    let changesFound = false;
    Object.keys(graph.nodes).forEach(nodeId => {
      const node = graph.nodes[nodeId];
      const varName = `m_${nodeId}`;
      const newValue = result[varName] || 0;
      const oldValue = node.machineCount || 0;
      const changed = Math.abs(newValue - oldValue) > EPSILON;
      if (changed) {
        changesFound = true;
        console.log(`    ${node?.recipe?.name || nodeId}: ${oldValue.toFixed(4)} → ${newValue.toFixed(4)}`);
      }
    });
    if (!changesFound) {
      console.log('    No changes needed');
    }
  } else {
    console.log('%c[LP Solver] No feasible solution', 'color: #e74c3c; font-weight: bold');
  }
  
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
  const { allowDeficiency = false } = options;
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
  const lpResult = await solveFullGraph(graph, targetNodeIds);
  
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
      if (deficitAmount > EPSILON) {
        hasDeficiency = true;
        const parts = key.split('_');
        const inputIndex = parseInt(parts[parts.length - 1]);
        const nodeId = parts.slice(1, -1).join('_');
        const node = graph.nodes[nodeId];
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