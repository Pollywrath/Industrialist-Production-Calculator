export interface LPSolverNode {
  id: string;
  currentMachineCount: number;
  isTarget: boolean;
  power: number;
  pollution: number;
  inputs: {
    productId: string;
    quantity: number;
    isSink: boolean;
  }[];
  outputs: {
    productId: string;
    quantity: number;
    hasSinkConnection: boolean;
  }[];
}

export interface LPSolverConnection {
  id: string;
  sourceNodeId: string;
  sourceOutputIndex: number;
  targetNodeId: string;
  targetInputIndex: number;
}

export interface LPSolverRequest {
  origin: string;
  nodes: LPSolverNode[];
  connections: LPSolverConnection[];
  version?: string;
}

export interface LPSolverResponse {
  feasible: boolean;
  error?: string;
  machineCounts?: Record<string, number>;
  diagnostics?: LPFailureDiagnostics;
}

export interface LPDeficientInputDiagnostic {
  nodeId: string;
  inputIndex: number;
  productId: string;
  deficiency: number;
  upstreamNodeIds: string[];
}

export interface LPFailureDiagnostics {
  deficientNodeIds: string[];
  likelyRootNodeIds: string[];
  cycleNodeIds: string[];
  deficientInputs: LPDeficientInputDiagnostic[];
}

interface SCIPRuntime {
  FS: {
    writeFile: (path: string, data: string) => void;
    readFile: (path: string, options: { encoding: 'utf8' }) => string;
    unlink: (path: string) => void;
  };
  main: (args: string[]) => void;
  stdoutLines: string[];
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

self.onmessage = async (event: MessageEvent<LPSolverRequest>) => {
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
    console.error('[LP Worker] Run failed:', errorMsg, errorStack);
    self.postMessage({
      feasible: false,
      error: `Worker execution failed: ${errorMsg}`,
    });
  }
};

function buildMPS(nodes: LPSolverNode[], connections: LPSolverConnection[]) {
  const variables: string[] = [];
  const varSet = new Set<string>();
  const varNameMap = new Map<string, string>();
  const objCoeffs = new Map<string, number>();

  const rowMap = new Map<string, { type: 'E' | 'L' | 'G'; rhs: number; terms: Map<string, number> }>();
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

  const registerRow = (name: string, type: 'E' | 'L' | 'G', rhs = 0) => {
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

    const machineWeight = 1e-3 + 1e-8 * (node.power ?? 0) + 1e-5 * (node.pollution ?? 0);
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
        addObjCoeff(excessVar, 1e6);
      }

      const rowName = registerRow(`flow_out_${node.id}_${outputIndex}`, 'E', 0);
      addRowTerm(rowName, mVar, out.quantity);
      outgoingVarNames.forEach(fVar => addRowTerm(rowName, fVar, -1));
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

      if (inp.isSink) {
        const rowName = registerRow(`sink_cap_${node.id}_${inputIndex}`, 'L', 0);
        incomingVarNames.forEach(fVar => addRowTerm(rowName, fVar, 1));
        addRowTerm(rowName, mVar, -inp.quantity);
      } else {
        const deficitVar = registerVar(`deficit_${node.id}_${inputIndex}`);
        addObjCoeff(deficitVar, 1e12);

        const rowName = registerRow(`flow_in_${node.id}_${inputIndex}`, 'E', 0);
        incomingVarNames.forEach(fVar => addRowTerm(rowName, fVar, 1));
        addRowTerm(rowName, deficitVar, 1);
        addRowTerm(rowName, mVar, -inp.quantity);
      }
    });
  }

  const out: string[] = [];
  out.push('NAME          MODEL\n');

  out.push('ROWS\n');
  out.push(' N  obj\n');
  rowOrder.forEach(rowName => {
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

  rowOrder.forEach(rowName => {
    const row = rowMap.get(rowName)!;
    row.terms.forEach((coeff, varName) => {
      if (coeff !== 0) getColEntries(varName).push([rowName, coeff]);
    });
  });

  variables.forEach(varName => {
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
  rowOrder.forEach(rowName => {
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

function parseSCIPSolution(
  solutionText: string,
  varNameMap: Map<string, string>,
  connections: LPSolverConnection[],
  nodes: LPSolverNode[]
): LPSolverResponse {
  const DEFICIENCY_EPSILON = 1e-6;

  if (
    !solutionText ||
    solutionText.includes('no solution available') ||
    solutionText.includes('infeasible')
  ) {
    return { feasible: false, error: 'Model is infeasible given the current constraints.' };
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
    const diagnostics = buildFailureDiagnostics(unresolvedDeficits, connections, nodes);
    return {
      feasible: false,
      error:
        `The solver could not fully satisfy connected inputs. ` +
        `${unresolvedDeficiencyCount} connected input ` +
        `${unresolvedDeficiencyCount === 1 ? 'port is' : 'ports are'} still short by ` +
        `${unresolvedDeficiencyTotal.toFixed(6)} units/sec total. ` +
        `This usually means the current graph has an upstream bottleneck, a feedback loop, ` +
        `or recipe conditions (such as temperature gating) that block required output.`,
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
  connections: LPSolverConnection[],
  nodes: LPSolverNode[]
): LPFailureDiagnostics {
  const deficientInputs: LPDeficientInputDiagnostic[] = [];
  const deficientNodeIds = new Set<string>();
  const nodeById = new Map<string, LPSolverNode>();
  for (const node of nodes) {
    nodeById.set(node.id, node);
  }

  const incomingByInput = new Map<string, string[]>();
  for (const connection of connections) {
    const key = `${connection.targetNodeId}::${connection.targetInputIndex}`;
    const list = incomingByInput.get(key);
    if (list) {
      list.push(connection.sourceNodeId);
    } else {
      incomingByInput.set(key, [connection.sourceNodeId]);
    }
  }

  for (const deficit of unresolvedDeficits) {
    const parsed = parseDeficitVarName(deficit.name);
    if (!parsed) continue;
    const { nodeId, inputIndex } = parsed;
    deficientNodeIds.add(nodeId);

    const node = nodeById.get(nodeId);
    const productId = node?.inputs[inputIndex]?.productId ?? 'unknown';
    const upstreamNodeIds = incomingByInput.get(`${nodeId}::${inputIndex}`) ?? [];

    deficientInputs.push({
      nodeId,
      inputIndex,
      productId,
      deficiency: deficit.value,
      upstreamNodeIds: [...new Set(upstreamNodeIds)],
    });
  }

  deficientInputs.sort((a, b) => b.deficiency - a.deficiency);

  const deficientUpstream = new Map<string, Set<string>>();
  const deficientDownstream = new Map<string, Set<string>>();
  for (const nodeId of deficientNodeIds) {
    deficientUpstream.set(nodeId, new Set());
    deficientDownstream.set(nodeId, new Set());
  }

  for (const input of deficientInputs) {
    if (!deficientNodeIds.has(input.nodeId)) continue;
    for (const upstreamNodeId of input.upstreamNodeIds) {
      if (!deficientNodeIds.has(upstreamNodeId)) continue;
      deficientUpstream.get(input.nodeId)?.add(upstreamNodeId);
      deficientDownstream.get(upstreamNodeId)?.add(input.nodeId);
    }
  }

  const deficiencyByNode = new Map<string, number>();
  for (const input of deficientInputs) {
    deficiencyByNode.set(
      input.nodeId,
      (deficiencyByNode.get(input.nodeId) ?? 0) + input.deficiency
    );
  }

  const sortedDeficientNodeIds = [...deficientNodeIds].sort((a, b) => {
    const deficiencyDelta = (deficiencyByNode.get(b) ?? 0) - (deficiencyByNode.get(a) ?? 0);
    if (Math.abs(deficiencyDelta) > 1e-9) return deficiencyDelta;
    return a.localeCompare(b);
  });

  const likelyRootNodeIds = sortedDeficientNodeIds.filter(
    (nodeId) => (deficientUpstream.get(nodeId)?.size ?? 0) === 0
  );

  const cycleNodeIds = findCycleNodes(deficientDownstream);
  if (likelyRootNodeIds.length === 0 && cycleNodeIds.length > 0) {
    likelyRootNodeIds.push(...cycleNodeIds);
  }

  return {
    deficientNodeIds: sortedDeficientNodeIds,
    likelyRootNodeIds,
    cycleNodeIds,
    deficientInputs,
  };
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

function findCycleNodes(graph: Map<string, Set<string>>): string[] {
  const indexMap = new Map<string, number>();
  const lowLinkMap = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycleNodes = new Set<string>();
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
      for (const id of component) cycleNodes.add(id);
      return;
    }

    const single = component[0];
    if (!single) return;
    if (graph.get(single)?.has(single)) {
      cycleNodes.add(single);
    }
  };

  for (const nodeId of graph.keys()) {
    if (!indexMap.has(nodeId)) {
      strongConnect(nodeId);
    }
  }

  return [...cycleNodes].sort((a, b) => a.localeCompare(b));
}
