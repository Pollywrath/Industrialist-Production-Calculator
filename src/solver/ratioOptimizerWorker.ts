import type {
  RatioDeficiencyCauseKind,
  RatioDeficientInputDiagnostic,
  RatioFailureDiagnostics,
  RatioOptimizerConnection,
  RatioOptimizerNode,
  RatioOptimizerRequest,
  RatioOptimizerResponse,
  RatioRootCauseDiagnostic,
  RatioUpstreamContributionDiagnostic,
} from './ratioOptimizer';

interface SCIPRuntime {
  FS: {
    writeFile: (path: string, data: string) => void;
    readFile: (path: string, options: { encoding: 'utf8' }) => string;
    unlink: (path: string) => void;
  };
  main: (args: string[]) => void;
  stdoutLines: string[];
}

interface RatioMPSModel {
  mpsString: string;
  varNameMap: Map<string, string>;
}

type MPSRowType = 'E' | 'L' | 'G';

interface MPSRow {
  type: MPSRowType;
  rhs: number;
  terms: Map<string, number>;
}

let runtimePromise: Promise<SCIPRuntime> | null = null;
let runtimeKey: string | null = null;

function getRuntimeKey(origin: string, version?: string): string {
  return `${origin}::${version ?? ''}`;
}

async function getOrCreateRuntime(origin: string, version?: string): Promise<SCIPRuntime> {
  const nextKey = getRuntimeKey(origin, version);
  if (runtimePromise && runtimeKey === nextKey) {
    return runtimePromise;
  }

  runtimeKey = nextKey;
  runtimePromise = (async () => {
    const versionSuffix = version ? `?v=${version}` : '';
    const scipUrl = `${origin}/scip/scip.js${versionSuffix}`;
    const scipModule = await import(/* @vite-ignore */ scipUrl);
    const createSCIP = scipModule.default;

    const stdoutLines: string[] = [];
    const scip = await createSCIP({
      locateFile: (file: string) => `${origin}/scip/${file}${versionSuffix}`,
      print: (text: string) => {
        stdoutLines.push(text);
      },
      printErr: (text: string) => {
        stdoutLines.push(text);
      },
    });

    return {
      FS: scip.FS,
      main: scip.callMain,
      stdoutLines,
    };
  })();

  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = null;
    runtimeKey = null;
    throw error;
  }
}

export function buildMPS(nodes: RatioOptimizerNode[], connections: RatioOptimizerConnection[]): RatioMPSModel {
  const variables: string[] = [];
  const varSet = new Set<string>();
  const varNameMap = new Map<string, string>();
  const objCoeffs = new Map<string, number>();
  const rowMap = new Map<string, MPSRow>();
  const rowOrder: string[] = [];

  let varCounter = 0;

  const registerVar = (originalName: string) => {
    let sanitized = originalName.replace(/[^a-zA-Z0-9_]/g, '_');
    if (varSet.has(sanitized)) {
      sanitized = `${sanitized}_c${varCounter++}`;
    }
    varSet.add(sanitized);
    variables.push(sanitized);
    varNameMap.set(sanitized, originalName);
    return sanitized;
  };

  const addObjCoeff = (varName: string, coeff: number) => {
    if (coeff === 0) return;
    objCoeffs.set(varName, (objCoeffs.get(varName) || 0) + coeff);
  };

  const registerRow = (name: string, type: MPSRowType, rhs = 0) => {
    let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (rowMap.has(sanitized)) {
      sanitized = `${sanitized}_r${varCounter++}`;
    }
    rowMap.set(sanitized, { type, rhs, terms: new Map() });
    rowOrder.push(sanitized);
    return sanitized;
  };

  const addRowTerm = (rowName: string, varName: string, coeff: number) => {
    if (coeff === 0) return;
    const row = rowMap.get(rowName);
    if (row) {
      row.terms.set(varName, (row.terms.get(varName) || 0) + coeff);
    }
  };

  const nodeMachineVars = new Map<string, string>();
  for (const node of nodes) {
    const mVar = registerVar(`m_${node.id}`);
    nodeMachineVars.set(node.id, mVar);

    const machineWeight = Math.max(
      1e-6,
      1e-3 + 1e-8 * (node.power ?? 0) + 1e-5 * (node.pollution ?? 0)
    );
    addObjCoeff(mVar, machineWeight);
  }

  const edgeFlowVars = new Map<string, string>();
  for (const conn of connections) {
    const fVar = registerVar(`f_${conn.id}`);
    edgeFlowVars.set(conn.id, fVar);
  }

  for (const node of nodes) {
    const mVar = nodeMachineVars.get(node.id)!;
    node.outputs.forEach((out, outputIndex) => {
      const outgoingVarNames: string[] = [];
      for (const c of connections) {
        if (c.sourceNodeId === node.id && c.sourceOutputIndex === outputIndex) {
          const fVar = edgeFlowVars.get(c.id);
          if (fVar) outgoingVarNames.push(fVar);
        }
      }

      if (!node.isTarget && outgoingVarNames.length === 0) return;

      const excessVar = registerVar(`excess_${node.id}_${outputIndex}`);
      if (out.hasSinkConnection) {
        addObjCoeff(excessVar, 1e8);
      }

      const rowName = registerRow(`flow_out_${node.id}_${outputIndex}`, 'E', 0);
      addRowTerm(rowName, mVar, out.quantity);
      outgoingVarNames.forEach((fVar) => addRowTerm(rowName, fVar, -1));
      addRowTerm(rowName, excessVar, -1);
    });
  }

  for (const node of nodes) {
    const mVar = nodeMachineVars.get(node.id)!;
    node.inputs.forEach((inp, inputIndex) => {
      const incomingVarNames: string[] = [];
      for (const c of connections) {
        if (c.targetNodeId === node.id && c.targetInputIndex === inputIndex) {
          const fVar = edgeFlowVars.get(c.id);
          if (fVar) incomingVarNames.push(fVar);
        }
      }

      if (incomingVarNames.length === 0) return;

      if (inp.isSink && !node.isTarget) {
        const rowName = registerRow(`sink_cap_${node.id}_${inputIndex}`, 'L', 0);
        incomingVarNames.forEach((fVar) => addRowTerm(rowName, fVar, 1));
        addRowTerm(rowName, mVar, -inp.quantity);
      } else {
        const deficitVar = registerVar(`deficit_${node.id}_${inputIndex}`);
        const isSinkNode = node.outputs.length === 0 || node.inputs.some((inp) => inp.isSink);
        const penalty = isSinkNode ? 1e4 : 1e12;
        addObjCoeff(deficitVar, penalty);

        const rowName = registerRow(`flow_in_${node.id}_${inputIndex}`, 'E', 0);
        incomingVarNames.forEach((fVar) => addRowTerm(rowName, fVar, 1));
        addRowTerm(rowName, deficitVar, 1);
        addRowTerm(rowName, mVar, -inp.quantity);
      }
    });
  }

  const out: string[] = [];
  out.push('NAME          MODEL\n');

  out.push('ROWS\n');
  out.push(' N  obj\n');
  rowOrder.forEach((rowName) => {
    const row = rowMap.get(rowName)!;
    out.push(` ${row.type}  ${rowName}\n`);
  });

  out.push('COLUMNS\n');
  const colEntries = new Map<string, [string, number][]>();
  const getColEntries = (v: string) => {
    let list = colEntries.get(v);
    if (!list) {
      list = [];
      colEntries.set(v, list);
    }
    return list;
  };

  objCoeffs.forEach((coeff, varName) => {
    if (coeff !== 0) getColEntries(varName).push(['obj', coeff]);
  });

  rowOrder.forEach((rowName) => {
    const row = rowMap.get(rowName)!;
    row.terms.forEach((coeff, varName) => {
      if (coeff !== 0) getColEntries(varName).push([rowName, coeff]);
    });
  });

  variables.forEach((varName) => {
    const entries = colEntries.get(varName) || [];
    if (entries.length === 0) {
      out.push(`    ${varName}  obj  0\n`);
      return;
    }
    entries.forEach(([rowName, coeff]) => {
      out.push(`    ${varName}  ${rowName}  ${coeff}\n`);
    });
  });

  out.push('RHS\n');
  rowOrder.forEach((rowName) => {
    const row = rowMap.get(rowName)!;
    if (row.rhs !== 0) {
      out.push(`    RHS  ${rowName}  ${row.rhs}\n`);
    }
  });

  out.push('BOUNDS\n');
  for (const node of nodes) {
    if (node.isTarget && node.currentMachineCount > 0) {
      const mVar = nodeMachineVars.get(node.id)!;
      out.push(` LO BND  ${mVar}  ${node.currentMachineCount}\n`);
    }
  }

  out.push('ENDATA\n');

  return {
    mpsString: out.join(''),
    varNameMap,
  };
}

self.onmessage = async (event: MessageEvent<RatioOptimizerRequest>) => {
  const { origin, nodes, connections, version } = event.data;

  try {
    const { mpsString, varNameMap } = buildMPS(nodes, connections);

    const { FS, main, stdoutLines } = await getOrCreateRuntime(origin, version);
    stdoutLines.length = 0;

    try {
      FS.unlink('sol.txt');
    } catch {
      void 0;
    }
    FS.writeFile('model.mps', mpsString);

    main(['-c', 'read model.mps', '-c', 'optimize', '-c', 'display solution', '-c', 'quit']);

    const stdoutText = stdoutLines.join('\n');
    let solutionText = '';
    try {
      solutionText = FS.readFile('sol.txt', { encoding: 'utf8' }) as string;
    } catch {
      solutionText = stdoutText;
    }

    const response = parseSCIPSolution(solutionText, varNameMap, connections, nodes);
    self.postMessage(response);

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error('[Ratio Optimizer Worker] Run failed:', errorMsg, errorStack);
    self.postMessage({
      feasible: false,
      error: `Worker execution failed: ${errorMsg}`,
    });
  }
};

export function parseSCIPSolution(
  solutionText: string,
  varNameMap: Map<string, string>,
  connections: RatioOptimizerConnection[],
  nodes: RatioOptimizerNode[]
): RatioOptimizerResponse {
  const DEFICIENCY_EPSILON = 1e-6;

  if (
    !solutionText ||
    solutionText.includes('no solution available') ||
    solutionText.includes('infeasible')
  ) {
    return { feasible: false, error: 'Model is infeasible given the current constraints.' };
  }

  if (solutionText.includes('unbounded')) {
    return {
      feasible: false,
      error:
        'The model is unbounded. This usually means a power-producing machine ' +
        'has an unexpectedly large negative cost coefficient. Please report this issue.',
    };
  }

  if (
    !solutionText.includes('optimal solution found') &&
    !solutionText.includes('solution status: feasible')
  ) {
    return { feasible: false, error: 'No feasible or optimal solution found.' };
  }

  const rawValues: Record<string, number> = {};
  const lines = solutionText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('solution status') || trimmed.startsWith('objective value')) continue;

    const match = trimmed.match(/^(\S+)\s+([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
    if (!match) continue;

    const sanitizedName = match[1];
    const value = parseFloat(match[2]);
    if (isNaN(value)) continue;

    const originalVarName = varNameMap.get(sanitizedName);
    if (originalVarName) {
      rawValues[originalVarName] = value;
    }
  }

  const machineCounts: Record<string, number> = {};
  for (const node of nodes) {
    const varName = `m_${node.id}`;
    let count = rawValues[varName] !== undefined ? rawValues[varName] : 0;
    if (count < 1e-8) {
      count = 0;
    }
    machineCounts[node.id] = count;
  }

  let unresolvedDeficiencyTotal = 0;
  let unresolvedDeficiencyCount = 0;
  const unresolvedDeficits: Array<{ name: string; value: number }> = [];
  const rawEntries = Object.entries(rawValues);
  for (let i = 0; i < rawEntries.length; i++) {
    const [varName, value] = rawEntries[i];
    if (!varName.startsWith('deficit_')) continue;
    if (!Number.isFinite(value) || value <= DEFICIENCY_EPSILON) continue;
    unresolvedDeficiencyTotal += value;
    unresolvedDeficiencyCount += 1;
    unresolvedDeficits.push({ name: varName, value });
  }

  if (unresolvedDeficiencyCount > 0) {
    const diagnostics = buildFailureDiagnostics(
      unresolvedDeficits,
      connections,
      nodes,
      rawValues,
      machineCounts
    );
    return {
      feasible: false,
      error:
        `The solver could not fully satisfy connected inputs. ` +
        `${unresolvedDeficiencyCount} connected input ` +
        `${unresolvedDeficiencyCount === 1 ? 'port is' : 'ports are'} still short by ` +
        `${unresolvedDeficiencyTotal.toFixed(6)} units/sec total.`,
      diagnostics,
    };
  }

  return {
    feasible: true,
    machineCounts,
  };
}

function buildFailureDiagnostics(
  unresolvedDeficits: Array<{ name: string; value: number }>,
  connections: RatioOptimizerConnection[],
  nodes: RatioOptimizerNode[],
  rawValues: Record<string, number>,
  machineCounts: Record<string, number>
): RatioFailureDiagnostics {
  const deficientInputs: RatioDeficientInputDiagnostic[] = [];
  const deficientNodeIds = new Set<string>();
  const nodeById = new Map<string, RatioOptimizerNode>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
  }

  const incomingByInput = new Map<string, RatioOptimizerConnection[]>();
  const outgoingByOutput = new Map<string, RatioOptimizerConnection[]>();
  for (const connection of connections) {
    const inputKey = `${connection.targetNodeId}::${connection.targetInputIndex}`;
    const inputConnections = incomingByInput.get(inputKey);
    if (inputConnections) {
      inputConnections.push(connection);
    } else {
      incomingByInput.set(inputKey, [connection]);
    }

    const outputKey = `${connection.sourceNodeId}::${connection.sourceOutputIndex}`;
    const outputConnections = outgoingByOutput.get(outputKey);
    if (outputConnections) {
      outputConnections.push(connection);
    } else {
      outgoingByOutput.set(outputKey, [connection]);
    }
  }

  const parsedDeficits: Array<{
    nodeId: string;
    inputIndex: number;
    value: number;
  }> = [];
  for (const deficit of unresolvedDeficits) {
    const parsed = parseDeficitVarName(deficit.name);
    if (!parsed) continue;
    const { nodeId, inputIndex } = parsed;
    deficientNodeIds.add(nodeId);
    parsedDeficits.push({
      nodeId,
      inputIndex,
      value: deficit.value,
    });
  }

  const deficiencyByNode = new Map<string, number>();
  for (const deficit of parsedDeficits) {
    deficiencyByNode.set(
      deficit.nodeId,
      (deficiencyByNode.get(deficit.nodeId) ?? 0) + deficit.value
    );
  }

  const deficientUpstream = new Map<string, Set<string>>();
  const deficientDownstream = new Map<string, Set<string>>();
  const structuralDownstream = new Map<string, Set<string>>();
  for (const nodeId of deficientNodeIds) {
    deficientUpstream.set(nodeId, new Set());
    deficientDownstream.set(nodeId, new Set());
  }

  for (const node of nodes) {
    structuralDownstream.set(node.id, new Set());
  }

  for (const connection of connections) {
    structuralDownstream.get(connection.sourceNodeId)?.add(connection.targetNodeId);
  }

  for (const deficit of parsedDeficits) {
    const inputConnections = incomingByInput.get(`${deficit.nodeId}::${deficit.inputIndex}`) ?? [];
    for (const connection of inputConnections) {
      if (!deficientNodeIds.has(connection.sourceNodeId)) continue;
      deficientUpstream.get(deficit.nodeId)?.add(connection.sourceNodeId);
      deficientDownstream.get(connection.sourceNodeId)?.add(deficit.nodeId);
    }
  }

  const cycleComponents = findCycleComponents(structuralDownstream);
  const cycleNodeIds = cycleComponents
    .flatMap((component) => component.nodeIds)
    .sort((a, b) => a.localeCompare(b));
  const cycleNodeIdSet = new Set(cycleNodeIds);

  for (const deficit of parsedDeficits) {
    const { nodeId, inputIndex } = deficit;

    const node = nodeById.get(nodeId);
    const input = node?.inputs[inputIndex];
    const productId = input?.productId ?? 'unknown';
    const requiredRate = Math.max(0, (machineCounts[nodeId] ?? 0) * (input?.quantity ?? 0));
    const inputConnections = incomingByInput.get(`${nodeId}::${inputIndex}`) ?? [];
    const suppliedRate = inputConnections.reduce(
      (sum, connection) => sum + getRawFlowValue(rawValues, connection.id),
      0
    );

    const upstreamContributions = inputConnections.map((connection) => {
      const sourceNode = nodeById.get(connection.sourceNodeId);
      const sourceOutput = sourceNode?.outputs[connection.sourceOutputIndex];
      const outputKey = `${connection.sourceNodeId}::${connection.sourceOutputIndex}`;
      const siblingConnections = outgoingByOutput.get(outputKey) ?? [];
      const unitOutputRate = sourceOutput?.quantity ?? 0;
      const outputRate = Math.max(
        0,
        (machineCounts[connection.sourceNodeId] ?? 0) * unitOutputRate
      );
      const totalOutgoingRate = siblingConnections.reduce(
        (sum, sibling) => sum + getRawFlowValue(rawValues, sibling.id),
        0
      );

      return {
        edgeId: connection.id,
        nodeId: connection.sourceNodeId,
        outputIndex: connection.sourceOutputIndex,
        productId: sourceOutput?.productId ?? 'unknown',
        productMatches: !sourceOutput || sourceOutput.productId === productId,
        unitOutputRate,
        suppliedRate: getRawFlowValue(rawValues, connection.id),
        outputRate,
        totalOutgoingRate,
        directDeficiency: deficiencyByNode.get(connection.sourceNodeId) ?? 0,
      };
    });

    upstreamContributions.sort((a, b) => {
      const deficiencyDelta = b.directDeficiency - a.directDeficiency;
      if (Math.abs(deficiencyDelta) > 1e-9) return deficiencyDelta;
      const suppliedDelta = a.suppliedRate - b.suppliedRate;
      if (Math.abs(suppliedDelta) > 1e-9) return suppliedDelta;
      return a.nodeId.localeCompare(b.nodeId);
    });

    const upstreamNodeIds = upstreamContributions.map((contribution) => contribution.nodeId);
    const causeKind = classifyDeficiencyCause(
      nodeId,
      upstreamContributions,
      cycleNodeIdSet
    );
    const causeNodeIds = getCauseNodeIds(nodeId, upstreamContributions, deficientNodeIds);

    deficientInputs.push({
      nodeId,
      inputIndex,
      productId,
      deficiency: deficit.value,
      requiredRate,
      suppliedRate,
      upstreamNodeIds: [...new Set(upstreamNodeIds)],
      causeNodeIds,
      causeKind,
      upstreamContributions,
    });
  }

  deficientInputs.sort((a, b) => b.deficiency - a.deficiency);

  attachCycleBoundaryNodeIds(cycleComponents, deficientInputs, connections);
  const cycleBoundaryNodeIds = [
    ...new Set(cycleComponents.flatMap((component) => component.boundaryNodeIds)),
  ].sort((a, b) => a.localeCompare(b));

  const deficientInputsByNode = getDeficientInputsByNode(deficientInputs);
  const rootCauseContext: RatioRootCauseTraceContext = {
    deficientInputsByNode,
    incomingByInput,
    nodeById,
    cycleNodeToComponent: getCycleNodeToComponent(cycleComponents),
    rootCauseCache: new Map(),
  };

  for (const input of deficientInputs) {
    const rootCausesForInput = traceRootCausesFromInput(
      input,
      rootCauseContext,
      new Set()
    );
    if (rootCausesForInput.length === 0) continue;

    input.causeKind = summarizeRootCauseKind(rootCausesForInput);
    input.causeNodeIds = getRootCauseNodeIds(rootCausesForInput);
  }

  const rootCauses = getSummaryRootCauses(
    deficientInputs,
    cycleComponents,
    rootCauseContext
  );

  const sortedDeficientNodeIds = [...deficientNodeIds].sort((a, b) => {
    const deficiencyDelta = (deficiencyByNode.get(b) ?? 0) - (deficiencyByNode.get(a) ?? 0);
    if (Math.abs(deficiencyDelta) > 1e-9) return deficiencyDelta;
    return a.localeCompare(b);
  });

  const likelyRootNodeIds = getRootCauseNodeIds(rootCauses);
  if (likelyRootNodeIds.length === 0) {
    likelyRootNodeIds.push(...getLikelyRootNodeIds(
      deficientInputs,
      deficientNodeIds,
      deficiencyByNode,
      deficientUpstream
    ));
  }
  if (likelyRootNodeIds.length === 0 && cycleNodeIds.length > 0) {
    likelyRootNodeIds.push(...cycleNodeIds);
  }

  return {
    deficientNodeIds: sortedDeficientNodeIds,
    likelyRootNodeIds,
    cycleNodeIds,
    cycleBoundaryNodeIds,
    rootCauses,
    deficientInputs,
  };
}

interface RatioCycleComponent {
  nodeIds: string[];
  nodeIdSet: Set<string>;
  boundaryNodeIds: string[];
}

interface RatioRootCauseTraceContext {
  deficientInputsByNode: Map<string, RatioDeficientInputDiagnostic[]>;
  incomingByInput: Map<string, RatioOptimizerConnection[]>;
  nodeById: Map<string, RatioOptimizerNode>;
  cycleNodeToComponent: Map<string, RatioCycleComponent>;
  rootCauseCache: Map<string, RatioRootCauseDiagnostic[]>;
}

function getDeficientInputsByNode(
  deficientInputs: RatioDeficientInputDiagnostic[]
): Map<string, RatioDeficientInputDiagnostic[]> {
  const deficientInputsByNode = new Map<string, RatioDeficientInputDiagnostic[]>();
  for (const input of deficientInputs) {
    const list = deficientInputsByNode.get(input.nodeId);
    if (list) {
      list.push(input);
    } else {
      deficientInputsByNode.set(input.nodeId, [input]);
    }
  }
  return deficientInputsByNode;
}

function getCycleNodeToComponent(cycleComponents: RatioCycleComponent[]): Map<string, RatioCycleComponent> {
  const cycleNodeToComponent = new Map<string, RatioCycleComponent>();
  for (const component of cycleComponents) {
    for (const nodeId of component.nodeIds) {
      cycleNodeToComponent.set(nodeId, component);
    }
  }
  return cycleNodeToComponent;
}

function attachCycleBoundaryNodeIds(
  cycleComponents: RatioCycleComponent[],
  deficientInputs: RatioDeficientInputDiagnostic[],
  connections: RatioOptimizerConnection[]
): void {
  for (const component of cycleComponents) {
    const boundaryNodeIds = new Set<string>();

    for (const input of deficientInputs) {
      if (!component.nodeIdSet.has(input.nodeId)) continue;
      if (input.upstreamContributions.some((contribution) => !component.nodeIdSet.has(contribution.nodeId))) {
        boundaryNodeIds.add(input.nodeId);
      }
    }

    for (const connection of connections) {
      const sourceInCycle = component.nodeIdSet.has(connection.sourceNodeId);
      const targetInCycle = component.nodeIdSet.has(connection.targetNodeId);
      if (sourceInCycle === targetInCycle) continue;
      boundaryNodeIds.add(sourceInCycle ? connection.sourceNodeId : connection.targetNodeId);
    }

    if (boundaryNodeIds.size === 0) {
      for (const nodeId of component.nodeIds) {
        boundaryNodeIds.add(nodeId);
      }
    }

    component.boundaryNodeIds = [...boundaryNodeIds].sort((a, b) => a.localeCompare(b));
  }
}

function traceRootCausesFromInput(
  input: RatioDeficientInputDiagnostic,
  context: RatioRootCauseTraceContext,
  visitedInputKeys: Set<string>
): RatioRootCauseDiagnostic[] {
  const inputKey = `${input.nodeId}::${input.inputIndex}::${input.deficiency.toFixed(9)}`;
  const cached = context.rootCauseCache.get(inputKey);
  if (cached) return cached;

  const cycleComponent = context.cycleNodeToComponent.get(input.nodeId);
  if (
    cycleComponent &&
    input.upstreamContributions.some((contribution) => cycleComponent.nodeIdSet.has(contribution.nodeId))
  ) {
    const rootCauses = [createCycleRootCause(input, cycleComponent)];
    context.rootCauseCache.set(inputKey, rootCauses);
    return rootCauses;
  }

  if (visitedInputKeys.has(inputKey)) {
    const rootCauses = [createUnresolvedRootCause(input, 'feedback_loop')];
    context.rootCauseCache.set(inputKey, rootCauses);
    return rootCauses;
  }

  visitedInputKeys.add(inputKey);
  const rootCauses: RatioRootCauseDiagnostic[] = [];

  for (const contribution of input.upstreamContributions) {
    if (!contribution.productMatches || contribution.unitOutputRate <= 1e-8) {
      rootCauses.push(createContributionRootCause(input, contribution));
      continue;
    }

    const structuralInputs = getConnectedRequiredInputsForNode(
      contribution.nodeId,
      context,
      input.deficiency
    );
    const structuralRootCauses: RatioRootCauseDiagnostic[] = [];
    for (const structuralInput of structuralInputs) {
      structuralRootCauses.push(...traceRootCausesFromInput(
        structuralInput,
        context,
        visitedInputKeys
      ));
    }

    if (structuralRootCauses.length > 0) {
      rootCauses.push(...structuralRootCauses);
      continue;
    }

    const upstreamDeficientInputs = context.deficientInputsByNode.get(contribution.nodeId) ?? [];
    if (contribution.directDeficiency > 1e-6 && upstreamDeficientInputs.length > 0) {
      for (const upstreamInput of upstreamDeficientInputs) {
        rootCauses.push(...traceRootCausesFromInput(
          upstreamInput,
          context,
          visitedInputKeys
        ));
      }
      continue;
    }
  }

  if (rootCauses.length === 0) {
    rootCauses.push(createUnresolvedRootCause(input, 'unknown'));
  }

  visitedInputKeys.delete(inputKey);
  const mergedRootCauses = mergeRootCauses(rootCauses);
  context.rootCauseCache.set(inputKey, mergedRootCauses);
  return mergedRootCauses;
}

function getConnectedRequiredInputsForNode(
  nodeId: string,
  context: RatioRootCauseTraceContext,
  inheritedDeficiency: number
): RatioDeficientInputDiagnostic[] {
  const node = context.nodeById.get(nodeId);
  if (!node) return [];

  const structuralInputs: RatioDeficientInputDiagnostic[] = [];
  for (let inputIndex = 0; inputIndex < node.inputs.length; inputIndex++) {
    const input = node.inputs[inputIndex];
    if (!input || input.isSink || input.quantity <= 1e-8) continue;

    const existingInput = context.deficientInputsByNode
      .get(nodeId)
      ?.find((candidate) => candidate.inputIndex === inputIndex);
    if (existingInput) {
      structuralInputs.push(existingInput);
      continue;
    }

    const inputConnections = context.incomingByInput.get(`${nodeId}::${inputIndex}`) ?? [];
    if (inputConnections.length === 0) continue;

    const upstreamContributions = inputConnections.map((connection) => {
      const sourceNode = context.nodeById.get(connection.sourceNodeId);
      const sourceOutput = sourceNode?.outputs[connection.sourceOutputIndex];
      const unitOutputRate = sourceOutput?.quantity ?? 0;

      return {
        edgeId: connection.id,
        nodeId: connection.sourceNodeId,
        outputIndex: connection.sourceOutputIndex,
        productId: sourceOutput?.productId ?? 'unknown',
        productMatches: !sourceOutput || sourceOutput.productId === input.productId,
        unitOutputRate,
        suppliedRate: 0,
        outputRate: 0,
        totalOutgoingRate: 0,
        directDeficiency: getNodeDeficiency(connection.sourceNodeId, context),
      };
    });

    structuralInputs.push({
      nodeId,
      inputIndex,
      productId: input.productId,
      deficiency: inheritedDeficiency,
      requiredRate: 0,
      suppliedRate: 0,
      upstreamNodeIds: [...new Set(upstreamContributions.map((contribution) => contribution.nodeId))],
      causeNodeIds: [],
      causeKind: 'unknown',
      upstreamContributions,
    });
  }

  return structuralInputs;
}

function getNodeDeficiency(nodeId: string, context: RatioRootCauseTraceContext): number {
  const deficientInputs = context.deficientInputsByNode.get(nodeId) ?? [];
  let total = 0;
  for (const input of deficientInputs) {
    total += input.deficiency;
  }
  return total;
}

function getSummaryRootCauses(
  deficientInputs: RatioDeficientInputDiagnostic[],
  cycleComponents: RatioCycleComponent[],
  context: RatioRootCauseTraceContext
): RatioRootCauseDiagnostic[] {
  const summaryInputs = deficientInputs.filter(
    (input) => !input.upstreamContributions.some((contribution) => contribution.directDeficiency > 1e-6)
  );

  if (summaryInputs.length === 0) {
    for (const component of cycleComponents) {
      const boundaryInput = deficientInputs.find(
        (input) =>
          component.boundaryNodeIds.includes(input.nodeId) &&
          component.nodeIdSet.has(input.nodeId)
      );
      if (boundaryInput) summaryInputs.push(boundaryInput);
    }
  }

  if (summaryInputs.length === 0 && deficientInputs.length > 0) {
    summaryInputs.push(deficientInputs[0]);
  }

  const rootCauses: RatioRootCauseDiagnostic[] = [];
  for (const input of summaryInputs) {
    rootCauses.push(...traceRootCausesFromInput(input, context, new Set()));
  }

  return selectRootCausesForDisplay(mergeRootCauses(rootCauses));
}

function createContributionRootCause(
  input: RatioDeficientInputDiagnostic,
  contribution: RatioUpstreamContributionDiagnostic
): RatioRootCauseDiagnostic {
  return {
    nodeId: contribution.nodeId,
    outputIndex: contribution.outputIndex,
    productId: contribution.productId,
    kind: getContributionRootCauseKind(contribution),
    deficiency: input.deficiency,
    requiredRate: input.requiredRate,
    suppliedRate: contribution.suppliedRate,
    unitOutputRate: contribution.unitOutputRate,
    outputRate: contribution.outputRate,
    blockedInputNodeId: input.nodeId,
    blockedInputIndex: input.inputIndex,
    cycleNodeIds: [],
    boundaryNodeIds: [],
  };
}

function createCycleRootCause(
  input: RatioDeficientInputDiagnostic,
  component: RatioCycleComponent
): RatioRootCauseDiagnostic {
  return {
    nodeId: component.boundaryNodeIds[0] ?? input.nodeId,
    outputIndex: null,
    productId: input.productId,
    kind: 'feedback_loop',
    deficiency: input.deficiency,
    requiredRate: input.requiredRate,
    suppliedRate: input.suppliedRate,
    unitOutputRate: 0,
    outputRate: 0,
    blockedInputNodeId: input.nodeId,
    blockedInputIndex: input.inputIndex,
    cycleNodeIds: component.nodeIds,
    boundaryNodeIds: component.boundaryNodeIds,
  };
}

function createUnresolvedRootCause(
  input: RatioDeficientInputDiagnostic,
  kind: RatioDeficiencyCauseKind
): RatioRootCauseDiagnostic {
  return {
    nodeId: input.nodeId,
    outputIndex: null,
    productId: input.productId,
    kind,
    deficiency: input.deficiency,
    requiredRate: input.requiredRate,
    suppliedRate: input.suppliedRate,
    unitOutputRate: 0,
    outputRate: 0,
    blockedInputNodeId: input.nodeId,
    blockedInputIndex: input.inputIndex,
    cycleNodeIds: [],
    boundaryNodeIds: [],
  };
}

function getContributionRootCauseKind(
  contribution: RatioUpstreamContributionDiagnostic
): RatioDeficiencyCauseKind {
  if (!contribution.productMatches) {
    return 'product_mismatch';
  }

  if (contribution.unitOutputRate <= 1e-8) {
    return 'upstream_not_producing';
  }

  return 'upstream_output_limited';
}

function summarizeRootCauseKind(rootCauses: RatioRootCauseDiagnostic[]): RatioDeficiencyCauseKind {
  const priority: RatioDeficiencyCauseKind[] = [
    'feedback_loop',
    'product_mismatch',
    'upstream_not_producing',
    'upstream_input_deficient',
    'upstream_output_limited',
    'unknown',
  ];

  for (const kind of priority) {
    if (rootCauses.some((cause) => cause.kind === kind)) {
      return kind;
    }
  }

  return 'unknown';
}

function getRootCauseNodeIds(rootCauses: RatioRootCauseDiagnostic[]): string[] {
  return [...new Set(rootCauses.map((cause) => cause.nodeId))]
    .sort((a, b) => a.localeCompare(b));
}

function mergeRootCauses(rootCauses: RatioRootCauseDiagnostic[]): RatioRootCauseDiagnostic[] {
  const mergedByKey = new Map<string, RatioRootCauseDiagnostic>();

  for (const cause of rootCauses) {
    const key = [
      cause.kind,
      cause.nodeId,
      cause.outputIndex ?? 'input',
      cause.productId,
      cause.cycleNodeIds.join(','),
      cause.boundaryNodeIds.join(','),
    ].join('::');
    const existing = mergedByKey.get(key);
    if (!existing) {
      mergedByKey.set(key, { ...cause });
      continue;
    }

    existing.deficiency += cause.deficiency;
    existing.requiredRate += cause.requiredRate;
    existing.suppliedRate += cause.suppliedRate;
    existing.outputRate = Math.max(existing.outputRate, cause.outputRate);
  }

  return [...mergedByKey.values()].sort((a, b) => {
    const priorityDelta = getRootCausePriority(a.kind) - getRootCausePriority(b.kind);
    if (priorityDelta !== 0) return priorityDelta;
    const deficiencyDelta = b.deficiency - a.deficiency;
    if (Math.abs(deficiencyDelta) > 1e-9) return deficiencyDelta;
    return a.nodeId.localeCompare(b.nodeId);
  });
}

function selectRootCausesForDisplay(
  rootCauses: RatioRootCauseDiagnostic[]
): RatioRootCauseDiagnostic[] {
  const zeroOutputCauses = rootCauses.filter((cause) => cause.kind === 'upstream_not_producing');
  if (zeroOutputCauses.length > 0) return zeroOutputCauses;

  const loopCauses = rootCauses.filter((cause) => cause.kind === 'feedback_loop');
  if (loopCauses.length > 0) return loopCauses;

  return rootCauses;
}

function getRootCausePriority(kind: RatioDeficiencyCauseKind): number {
  switch (kind) {
    case 'upstream_not_producing':
      return 0;
    case 'feedback_loop':
      return 1;
    case 'product_mismatch':
      return 2;
    case 'upstream_input_deficient':
      return 3;
    case 'upstream_output_limited':
      return 4;
    case 'unknown':
    default:
      return 5;
  }
}

function getRawFlowValue(rawValues: Record<string, number>, edgeId: string): number {
  const value = rawValues[`f_${edgeId}`] ?? 0;
  if (!Number.isFinite(value) || Math.abs(value) < 1e-8) return 0;
  return value;
}

function classifyDeficiencyCause(
  nodeId: string,
  upstreamContributions: RatioUpstreamContributionDiagnostic[],
  cycleNodeIds: Set<string>
): RatioDeficiencyCauseKind {
  if (
    cycleNodeIds.has(nodeId) ||
    upstreamContributions.some((contribution) => cycleNodeIds.has(contribution.nodeId))
  ) {
    return 'feedback_loop';
  }

  if (upstreamContributions.length === 0) {
    return 'unknown';
  }

  if (upstreamContributions.some((contribution) => !contribution.productMatches)) {
    return 'product_mismatch';
  }

  if (upstreamContributions.some((contribution) => contribution.directDeficiency > 1e-6)) {
    return 'upstream_input_deficient';
  }

  if (upstreamContributions.every((contribution) => contribution.unitOutputRate <= 1e-8)) {
    return 'upstream_not_producing';
  }

  return 'upstream_output_limited';
}

function getCauseNodeIds(
  nodeId: string,
  upstreamContributions: RatioUpstreamContributionDiagnostic[],
  deficientNodeIds: Set<string>
): string[] {
  if (upstreamContributions.length === 0) {
    return [nodeId];
  }

  const causeNodeIds = new Set<string>();
  for (const contribution of upstreamContributions) {
    if (!deficientNodeIds.has(contribution.nodeId)) {
      causeNodeIds.add(contribution.nodeId);
    }
  }

  if (causeNodeIds.size === 0) {
    for (const contribution of upstreamContributions) {
      causeNodeIds.add(contribution.nodeId);
    }
  }

  return [...causeNodeIds].sort((a, b) => a.localeCompare(b));
}

function getLikelyRootNodeIds(
  deficientInputs: RatioDeficientInputDiagnostic[],
  deficientNodeIds: Set<string>,
  deficiencyByNode: Map<string, number>,
  deficientUpstream: Map<string, Set<string>>
): string[] {
  const likelyRootNodeIds = new Set<string>();

  for (const input of deficientInputs) {
    if ((deficientUpstream.get(input.nodeId)?.size ?? 0) > 0) continue;
    for (const causeNodeId of input.causeNodeIds) {
      likelyRootNodeIds.add(causeNodeId);
    }
  }

  if (likelyRootNodeIds.size === 0) {
    for (const nodeId of deficientNodeIds) {
      if ((deficientUpstream.get(nodeId)?.size ?? 0) === 0) {
        likelyRootNodeIds.add(nodeId);
      }
    }
  }

  return [...likelyRootNodeIds].sort((a, b) => {
    const deficiencyDelta = (deficiencyByNode.get(b) ?? 0) - (deficiencyByNode.get(a) ?? 0);
    if (Math.abs(deficiencyDelta) > 1e-9) return deficiencyDelta;
    return a.localeCompare(b);
  });
}

function parseDeficitVarName(name: string): { nodeId: string; inputIndex: number } | null {
  if (!name.startsWith('deficit_')) return null;
  const lastUnderscore = name.lastIndexOf('_');
  if (lastUnderscore <= 'deficit_'.length) return null;

  const inputIndex = Number.parseInt(name.slice(lastUnderscore + 1), 10);
  if (!Number.isFinite(inputIndex)) return null;

  const nodeId = name.slice('deficit_'.length, lastUnderscore);
  if (!nodeId) return null;

  return { nodeId, inputIndex };
}

function findCycleComponents(graph: Map<string, Set<string>>): RatioCycleComponent[] {
  const indexMap = new Map<string, number>();
  const lowLinkMap = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycleComponents: RatioCycleComponent[] = [];
  let index = 0;

  const strongConnect = (nodeId: string): void => {
    indexMap.set(nodeId, index);
    lowLinkMap.set(nodeId, index);
    index += 1;

    stack.push(nodeId);
    onStack.add(nodeId);

    const neighbors = graph.get(nodeId);
    if (neighbors) {
      for (const neighbor of neighbors) {
        if (!indexMap.has(neighbor)) {
          strongConnect(neighbor);
          const lowLinkNode = lowLinkMap.get(nodeId) ?? 0;
          const lowLinkNeighbor = lowLinkMap.get(neighbor) ?? 0;
          lowLinkMap.set(nodeId, Math.min(lowLinkNode, lowLinkNeighbor));
        } else if (onStack.has(neighbor)) {
          const lowLinkNode = lowLinkMap.get(nodeId) ?? 0;
          const neighborIndex = indexMap.get(neighbor) ?? 0;
          lowLinkMap.set(nodeId, Math.min(lowLinkNode, neighborIndex));
        }
      }
    }

    const nodeIndex = indexMap.get(nodeId);
    const nodeLowLink = lowLinkMap.get(nodeId);
    if (nodeIndex === undefined || nodeLowLink === undefined || nodeLowLink !== nodeIndex) return;

    const component: string[] = [];
    let popped: string | undefined;
    do {
      popped = stack.pop();
      if (!popped) break;
      onStack.delete(popped);
      component.push(popped);
    } while (popped !== nodeId);

    if (component.length > 1) {
      const nodeIds = component.sort((a, b) => a.localeCompare(b));
      cycleComponents.push({
        nodeIds,
        nodeIdSet: new Set(nodeIds),
        boundaryNodeIds: [],
      });
      return;
    }

    const single = component[0];
    if (!single) return;
    if (graph.get(single)?.has(single)) {
      cycleComponents.push({
        nodeIds: [single],
        nodeIdSet: new Set([single]),
        boundaryNodeIds: [],
      });
    }
  };

  for (const nodeId of graph.keys()) {
    if (!indexMap.has(nodeId)) {
      strongConnect(nodeId);
    }
  }

  return cycleComponents.sort((a, b) => a.nodeIds.join(',').localeCompare(b.nodeIds.join(',')));
}
