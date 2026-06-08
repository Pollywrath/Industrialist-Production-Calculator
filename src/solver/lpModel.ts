import type { LPSolverConnection, LPSolverNode } from './lpTypes';

export interface LPMPSModel {
  mpsString: string;
  varNameMap: Map<string, string>;
}

type LPRowType = 'E' | 'L' | 'G';

interface LPRow {
  type: LPRowType;
  rhs: number;
  terms: Map<string, number>;
}

export function buildMPS(nodes: LPSolverNode[], connections: LPSolverConnection[]): LPMPSModel {
  const variables: string[] = [];
  const varSet = new Set<string>();
  const varNameMap = new Map<string, string>();
  const objCoeffs = new Map<string, number>();
  const rowMap = new Map<string, LPRow>();
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

  const registerRow = (name: string, type: LPRowType, rhs = 0) => {
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
        addObjCoeff(excessVar, 1e6);
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
        addObjCoeff(deficitVar, 1e12);

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
