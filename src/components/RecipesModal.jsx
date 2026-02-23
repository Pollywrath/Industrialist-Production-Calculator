import React, { useState, useMemo } from 'react';
import { getProductName } from '../utils/variableHandler';
import { getProduct } from '../data/dataLoader';
import { formatPowerDisplay } from '../utils/appUtilities';
import {
  hasTempDependentCycle, TEMP_DEPENDENT_MACHINES, recipeUsesSteam,
  getTempDependentCycleTime, DEFAULT_STEAM_TEMPERATURE,
} from '../utils/temperatureUtils';

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

const fmt = (n, decimals = 4) => {
  if (typeof n !== 'number') return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + 'k';
  if (abs >= 1) return parseFloat(n.toFixed(3)).toString();
  return parseFloat(n.toFixed(decimals)).toString();
};

const getCycleTime = (recipe, machine) => {
  let t = recipe.cycle_time;
  if (typeof t !== 'number' || t <= 0) t = 1;
  if (machine && hasTempDependentCycle(machine.id)) {
    const info = TEMP_DEPENDENT_MACHINES[machine.id];
    if (info?.type === 'steam_input' && recipeUsesSteam(recipe)) {
      const temp = recipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE;
      t = getTempDependentCycleTime(machine.id, temp, t);
    }
  }
  return typeof t === 'number' && t > 0 ? t : 1;
};

const getNodePower = (recipe, count) => {
  const p = recipe.power_consumption;
  if (typeof p === 'number') return formatPowerDisplay(p * count);
  if (typeof p === 'object' && p !== null && 'max' in p) return formatPowerDisplay(p.max * count) + ' max';
  return 'Var';
};

const getNodePollution = (recipe, count) =>
  typeof recipe.pollution === 'number' ? fmt(recipe.pollution * count, 3) + '%/hr' : '—';

const getNodeCost = (machine, count) =>
  typeof machine?.cost === 'number' ? '$' + fmt(Math.ceil(count) * machine.cost) : '—';

const tierColor = tier =>
  tier === 1 ? 'var(--tier-1-color)' : tier === 2 ? 'var(--tier-2-color)' :
  tier === 3 ? 'var(--tier-3-color)' : tier === 4 ? 'var(--tier-4-color)' : 'var(--tier-5-color)';

// Pick the best output to display for a root node (highest numeric quantity)
const bestOutput = (outputs) => {
  if (!outputs?.length) return undefined;
  return outputs.reduce((best, out) =>
    typeof out.quantity === 'number' &&
    (typeof best.quantity !== 'number' || out.quantity > best.quantity) ? out : best
  , outputs[0]);
};

// ─── Constants ────────────────────────────────────────────────────────────────

const WEIGHT_COLORS = {
  Deficiencies: 'var(--handle-input-deficient)',
  'Model Count': 'var(--color-primary)',
  Excesses:     'var(--tier-5-color)',
  Pollution:    'var(--handle-output-excess)',
  Power:        'var(--tier-3-color)',
  Cost:         'var(--tier-4-color)',
};

const COL = { product: 360, rate: 90, machine: 170, count: 70, power: 110, pollution: 90, cost: 90 };

const GUIDE_W = 18;
const GUIDE_COLOR = 'var(--border-light)';
const guideSegment = (() => {
  const c = GUIDE_COLOR;
  const base = { width: GUIDE_W, flexShrink: 0, alignSelf: 'stretch', backgroundRepeat: 'no-repeat' };
  const cache = {
    pass:  { ...base, backgroundImage: `linear-gradient(${c} 0%,${c} 100%)`, backgroundSize: '2px 100%', backgroundPosition: '8px 0' },
    tee:   { ...base, backgroundImage: `linear-gradient(${c},${c}),linear-gradient(${c},${c})`, backgroundSize: '2px 100%, calc(50% - 8px) 2px', backgroundPosition: '8px 0, 10px 50%' },
    elbow: { ...base, backgroundImage: `linear-gradient(${c},${c}),linear-gradient(${c},${c})`, backgroundSize: '2px 50%, calc(50% - 8px) 2px', backgroundPosition: '8px 0, 10px 50%' },
    empty: { width: GUIDE_W, flexShrink: 0 },
  };
  return (type) => cache[type] || cache.empty;
})();
const TOTAL_WIDTH = Object.values(COL).reduce((a, b) => a + b, 0);

const HEADER_STYLE = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  padding: '4px 6px', userSelect: 'none', letterSpacing: '0.04em', textTransform: 'uppercase',
};
const CELL_STYLE = {
  fontSize: '12px', color: 'var(--text-secondary)',
  padding: '3px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

// ─── Tree Data ────────────────────────────────────────────────────────────────

const buildTree = (nodes, edges, targetNodeIds) => {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const childrenOf = new Map(nodes.map(n => [n.id, []]));
  const parentsOf  = new Map(nodes.map(n => [n.id, new Set()]));

  const outputEdgeCount = new Map(); // "nodeId:outputIdx" → number of edges consuming that port

  for (const edge of edges) {
    const outputIdx = parseInt(edge.sourceHandle?.split('-')[1] ?? '0');
    childrenOf.get(edge.target)?.push({ childId: edge.source, outputIdx, edgeId: edge.id });
    parentsOf.get(edge.source)?.add(edge.target);
    const key = `${edge.source}:${outputIdx}`;
    outputEdgeCount.set(key, (outputEdgeCount.get(key) || 0) + 1);
  }

  const naturalRootIds = new Set(nodes.filter(n => parentsOf.get(n.id).size === 0).map(n => n.id));
  const roots = nodes.filter(n =>
    naturalRootIds.has(n.id) || (targetNodeIds?.has(n.id) && !naturalRootIds.has(n.id))
  );

  return { nodeMap, childrenOf, parentsOf, outputEdgeCount, roots, naturalRootIds };
};

// DFS to determine which parent→child edge is canonical (first visit of that child).
// Stored as "parentId->childId" strings. Non-canonical edges show a stub during render.
const computeCanonicalEdges = (rootId, childrenOf) => {
  const canonical = new Set();
  const visited   = new Set();

  const dfs = (nodeId, ancestors) => {
    if (visited.has(nodeId) || ancestors.has(nodeId)) return;
    visited.add(nodeId);
    const next = new Set([...ancestors, nodeId]);
    for (const { childId } of (childrenOf.get(nodeId) || [])) {
      if (!visited.has(childId) && !ancestors.has(childId)) {
        canonical.add(`${nodeId}->${childId}`);
      }
      dfs(childId, next);
    }
  };

  dfs(rootId, new Set());
  return canonical;
};

// ─── Weight Donut Chart ───────────────────────────────────────────────────────

const WeightDonut = ({ activeWeights }) => {
  const SIZE = 140, R = 52, STROKE = 18;
  const cx = SIZE / 2, cy = SIZE / 2;
  const circumference = 2 * Math.PI * R;
  const N = activeWeights.length;
  const total = (N * (N + 1)) / 2;
  let offset = 0;

  const segments = activeWeights.map((w, i) => {
    const proportion = (N - i) / total;
    const dash = proportion * circumference;
    const seg = { weight: w, color: WEIGHT_COLORS[w] || '#888', dash, gap: circumference - dash, offset, proportion };
    offset += dash;
    return seg;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
        {segments.map(seg => (
          <circle key={seg.weight} cx={cx} cy={cy} r={R} fill="none"
            stroke={seg.color} strokeWidth={STROKE}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={-seg.offset}
            style={{ transition: 'stroke-dasharray 0.4s' }}
          />
        ))}
        <circle cx={cx} cy={cy} r={R - STROKE / 2 - 4} fill="var(--bg-secondary)" />
        <circle cx={cx} cy={cy} r={R + STROKE / 2 + 2} fill="none" stroke="var(--border-light)" strokeWidth={1} />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' }}>
        {activeWeights.map((w, i) => (
          <div key={w} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: WEIGHT_COLORS[w] || '#888' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.2 }}>{w}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {(segments[i].proportion * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
        Chart shows relative rank.<br />Each tier = 1000× actual weight.
      </div>
    </div>
  );
};

// ─── Solver Tab ───────────────────────────────────────────────────────────────

const SolverTab = ({ activeWeights, unusedWeights, setActiveWeights, setUnusedWeights }) => {
  const allWeights  = [...activeWeights, ...unusedWeights];
  const totalActive = activeWeights.length;

  const btnBase = {
    width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)',
    background: 'var(--bg-main)', color: 'var(--text-primary)', cursor: 'pointer',
    fontSize: '14px', lineHeight: 1, flexShrink: 0, transition: 'opacity 0.15s', padding: 0,
  };

  const moveWeight = (weight, dir) => setActiveWeights(prev => {
    const next = [...prev];
    const i = next.indexOf(weight);
    [next[i + dir], next[i]] = [next[i], next[i + dir]];
    return next;
  });

  const toggleUsed = (weight, isActive) => {
    if (isActive) {
      setActiveWeights(prev => prev.filter(w => w !== weight));
      setUnusedWeights(prev => [...prev, weight]);
    } else {
      setUnusedWeights(prev => prev.filter(w => w !== weight));
      setActiveWeights(prev => [...prev, weight]);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '0', height: 'calc(90vh - 180px)' }}>
      <div style={{ flex: 1, display: 'flex', gap: '32px' }}>

        {/* Donut chart column */}
        <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-lg)', fontWeight: 700, textAlign: 'center', margin: 0 }}>
            Solver Configuration
          </h3>
          <div style={{
            background: 'var(--bg-main)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)', padding: '20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', flex: 1,
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Objective Priority Influence
            </div>
            <WeightDonut activeWeights={activeWeights} />
          </div>
          <button
            onClick={() => { setActiveWeights(['Deficiencies', 'Model Count', 'Excesses', 'Pollution', 'Power', 'Cost']); setUnusedWeights([]); }}
            className="btn btn-secondary"
            style={{ padding: '8px 12px', fontSize: 'var(--font-size-sm)' }}
          >
            Restore Defaults
          </button>
        </div>

        {/* Divider */}
        <div style={{ width: '2px', background: 'var(--border-divider)', flexShrink: 0 }} />

        {/* Weight list column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '5px', paddingTop: '44px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>
            PRIORITY ORDER — TOP IS HIGHEST
          </div>
          {allWeights.map(weight => {
            const isActive      = activeWeights.includes(weight);
            const isDeficiencies = weight === 'Deficiencies';
            const activeIndex   = activeWeights.indexOf(weight);
            const canMoveUp     = isActive && !isDeficiencies && activeIndex > 1;
            const canMoveDown   = isActive && !isDeficiencies && activeIndex < totalActive - 1;

            return (
              <div key={weight} style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 8px', background: 'var(--bg-secondary)',
                border: `2px solid ${isActive ? 'var(--color-primary)' : 'var(--border-light)'}`,
                borderRadius: 'var(--radius-sm)',
                opacity: isActive ? 1 : 0.45,
                transition: 'opacity 0.2s, border-color 0.2s',
              }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: WEIGHT_COLORS[weight] || '#888', opacity: isActive ? 1 : 0.5 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <button onClick={() => moveWeight(weight, -1)} disabled={!canMoveUp}
                    style={{ ...btnBase, opacity: canMoveUp ? 1 : 0.2, cursor: canMoveUp ? 'pointer' : 'default' }}
                    title="Move up">↑</button>
                  <button onClick={() => moveWeight(weight, 1)} disabled={!canMoveDown}
                    style={{ ...btnBase, opacity: canMoveDown ? 1 : 0.2, cursor: canMoveDown ? 'pointer' : 'default' }}
                    title="Move down">↓</button>
                </div>
                <span style={{ flex: 1, fontWeight: 600, fontSize: '12px', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', userSelect: 'none' }}>
                  {weight}
                </span>
                <button
                  onClick={isDeficiencies ? undefined : () => toggleUsed(weight, isActive)}
                  disabled={isDeficiencies}
                  style={{
                    ...btnBase, width: '50px', fontSize: '10px', fontWeight: 600,
                    opacity: isDeficiencies ? 0.2 : 1,
                    cursor: isDeficiencies ? 'default' : 'pointer',
                    color: isActive ? '#fca5a5' : '#86efac',
                    borderColor: isActive ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)',
                  }}
                  title={isDeficiencies ? 'Always active' : isActive ? 'Disable' : 'Enable'}
                >
                  {isDeficiencies ? '—' : isActive ? 'Off' : 'On'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Tree Row ─────────────────────────────────────────────────────────────────

// Inline stub row for repeated or cycle references
const StubRow = ({ node, outputIdx, depth, kind, onLocateNode, lineStates = [], isLast = true }) => {
  const { recipe, machine } = node.data || {};
  const output = outputIdx != null ? recipe?.outputs?.[outputIdx] : bestOutput(recipe?.outputs);
  const name   = output ? getProductName(output.product_id, getProduct) : recipe?.name || node.id;
  const indent = (depth + 1) * 18;
  const isCycle = kind === 'cycle';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', minWidth: TOTAL_WIDTH,
      background: isCycle
        ? 'color-mix(in srgb, var(--tier-4-color) 10%, var(--bg-main))'
        : 'color-mix(in srgb, var(--border-light) 25%, var(--bg-main))',
      borderBottom: '1px solid var(--border-light)',
      borderLeft: `3px ${isCycle ? 'solid' : 'dashed'} ${isCycle ? 'var(--tier-4-color)' : 'var(--border-primary)'}`,
      opacity: isCycle ? 1 : 0.7,
    }}>
      <div style={{ ...CELL_STYLE, width: COL.product, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0' }}>
        {lineStates.map((hasMore, d) => (
          <div key={d} style={guideSegment(d === depth - 1 ? (isLast ? 'elbow' : 'tee') : (hasMore ? 'pass' : 'empty'))} />
        ))}
        <span style={{ width: '14px', flexShrink: 0 }} />
        <span style={{
          color: isCycle ? 'var(--tier-4-color)' : 'var(--text-secondary)', fontStyle: 'italic',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px',
        }}>
          {name} {isCycle ? '↺' : '↑'}
        </span>
      </div>
      <div style={{ ...CELL_STYLE, width: COL.rate, flexShrink: 0, textAlign: 'right', color: isCycle ? 'var(--tier-4-color)' : undefined, fontSize: '11px', fontStyle: 'italic' }}>
        {isCycle ? 'cycle' : ''}
      </div>
      <div style={{ ...CELL_STYLE, width: COL.machine, flexShrink: 0 }}>
        {machine && (
          <span
            onClick={() => onLocateNode?.(node.id)}
            style={{
              color: tierColor(machine.tier), fontWeight: 500, fontSize: '12px',
              cursor: onLocateNode ? 'pointer' : 'default',
              textDecoration: onLocateNode ? 'underline dotted' : 'none',
              textUnderlineOffset: '3px',
            }}
          >
            {machine.name}
          </span>
        )}
      </div>
      <div style={{ ...CELL_STYLE, width: COL.count, flexShrink: 0 }} />
      <div style={{ ...CELL_STYLE, width: COL.power, flexShrink: 0 }} />
      <div style={{ ...CELL_STYLE, width: COL.pollution, flexShrink: 0 }} />
      <div style={{ ...CELL_STYLE, width: COL.cost, flexShrink: 0 }} />
    </div>
  );
};

const TreeRowInner = ({ node, depth, connectingOutputIdx, childrenOf, nodeMap, ancestorPath, onLocateNode, parentsOf, canonicalEdges, outputEdgeCount, scaleFactor = 1, productionSolution, noExpand = false, lineStates = [], isLast = true }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { recipe, machine, machineCount = 0 } = node.data || {};
  if (!recipe || !machine) return null;

  const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';
  const cycleTime        = getCycleTime(recipe, machine);
  const effectiveCount   = machineCount * scaleFactor;

  const displayOutput = connectingOutputIdx != null
    ? recipe.outputs?.[connectingOutputIdx]
    : bestOutput(recipe.outputs);

  const productName = displayOutput ? getProductName(displayOutput.product_id, getProduct) : recipe.name;

  const rate = displayOutput && typeof displayOutput.quantity === 'number'
    ? (isMineshaftDrill ? displayOutput.quantity : displayOutput.quantity / cycleTime) * effectiveCount
    : 0;

  const ancestorIds = useMemo(() => new Set(ancestorPath ? ancestorPath.split(',') : []), [ancestorPath]);
  const newAncestorPath = ancestorPath ? `${ancestorPath},${node.id}` : node.id;

  const children    = noExpand ? [] : (childrenOf.get(node.id) || []);
  const hasChildren = children.length > 0;

  // Excess/deficiency tinting
  const nodeFlows = productionSolution?.flows?.byNode[node.id];
  let hasExcess = false, hasDeficiency = false;
  if (nodeFlows) {
    recipe.inputs?.forEach((input, idx) => {
      if (typeof input.quantity !== 'number') return;
      const needed = (isMineshaftDrill ? input.quantity : input.quantity / cycleTime) * effectiveCount;
      const connected = (nodeFlows.inputFlows?.[idx]?.connected || 0) * scaleFactor;
      if (needed - connected > 0.001) hasDeficiency = true;
    });
    recipe.outputs?.forEach((output, idx) => {
      const qty = output.originalQuantity ?? output.quantity;
      if (typeof qty !== 'number') return;
      const produced = (isMineshaftDrill ? qty : qty / cycleTime) * effectiveCount;
      const connected = (nodeFlows.outputFlows?.[idx]?.connected || 0) * scaleFactor;
      if (produced - connected > 0.001) hasExcess = true;
    });
  }

  const baseRowBg = depth === 0
    ? 'var(--bg-secondary)'
    : depth % 2 === 0
    ? 'var(--bg-main)'
    : 'color-mix(in srgb, var(--border-light) 15%, var(--bg-main))';
  const rowBg = hasDeficiency
    ? 'color-mix(in srgb, var(--handle-input-deficient) 9%, transparent)'
    : hasExcess
    ? 'color-mix(in srgb, var(--handle-output-excess) 9%, transparent)'
    : baseRowBg;

  return (
    <>
      {/* Row */}
      <div style={{
        display: 'flex', alignItems: 'center', minWidth: TOTAL_WIDTH,
        background: rowBg,
        borderBottom: '1px solid var(--border-light)',
        borderLeft: noExpand
          ? '3px dashed var(--text-muted)'
          : depth === 0 ? '3px solid var(--color-primary)' : '3px solid transparent',
        opacity: noExpand ? 0.8 : 1,
      }}>
        {/* Product */}
        <div style={{ ...CELL_STYLE, width: COL.product, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0' }}>
          {lineStates.map((hasMore, d) => (
            <div key={d} style={guideSegment(d === depth - 1 ? (isLast ? 'elbow' : 'tee') : (hasMore ? 'pass' : 'empty'))} />
          ))}
          {hasChildren ? (
            <button
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? 'Expand' : 'Collapse'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '10px', padding: '0 2px', flexShrink: 0, width: '14px' }}
            >
              {collapsed ? '▶' : '▼'}
            </button>
          ) : (
            <span style={{ width: '14px', flexShrink: 0 }} />
          )}
          <span style={{
            color: depth === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: depth === 0 ? 700 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: depth === 0 ? '13px' : '12px',
          }}>
            {productName}
          </span>
        </div>

        {/* Rate */}
        <div style={{ ...CELL_STYLE, width: COL.rate, flexShrink: 0, textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 600 }}>
          {fmt(rate, 4)}/s
        </div>

        {/* Machine */}
        <div style={{ ...CELL_STYLE, width: COL.machine, flexShrink: 0 }}>
          <span
            onClick={() => onLocateNode?.(node.id)}
            style={{
              color: tierColor(machine.tier), fontWeight: 500, fontSize: '12px',
              cursor: onLocateNode ? 'pointer' : 'default',
              textDecoration: onLocateNode ? 'underline dotted' : 'none',
              textUnderlineOffset: '3px',
            }}
            title={onLocateNode ? `Locate ${machine.name} on canvas` : undefined}
          >
            {machine.name}
          </span>
        </div>

        {/* Count */}
        <div style={{ ...CELL_STYLE, width: COL.count, flexShrink: 0, textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
          {fmt(effectiveCount, 3)}
        </div>

        {/* Power */}
        <div style={{ ...CELL_STYLE, width: COL.power, flexShrink: 0, textAlign: 'right', color: 'var(--tier-3-color)' }}>
          {getNodePower(recipe, effectiveCount)}
        </div>

        {/* Pollution */}
        <div style={{ ...CELL_STYLE, width: COL.pollution, flexShrink: 0, textAlign: 'right', color: 'var(--stat-positive)' }}>
          {getNodePollution(recipe, effectiveCount)}
        </div>

        {/* Cost */}
        <div style={{ ...CELL_STYLE, width: COL.cost, flexShrink: 0, textAlign: 'right', color: 'var(--stat-value)' }}>
          {getNodeCost(machine, effectiveCount)}
        </div>
      </div>

      {/* Children */}
      {!collapsed && children.map(({ childId, outputIdx, edgeId }, i) => {
        const childNode = nodeMap.get(childId);
        if (!childNode) return null;

        // Cycle — child is a direct ancestor
        if (ancestorIds.has(childId) || childId === node.id) {
          const isLastChild = i === children.length - 1;
          return <StubRow key={`cycle-${childId}-${i}`} node={childNode} outputIdx={outputIdx} depth={depth} kind="cycle" onLocateNode={onLocateNode} lineStates={[...lineStates, !isLastChild]} isLast={isLastChild} />;
        }

        // Compute what fraction of this child's output goes to this specific edge
        let childScale;
        const edgeFlow = productionSolution?.flows?.byConnection?.[edgeId]?.flowRate;
        if (edgeFlow != null) {
          const childRecipe  = childNode.data?.recipe;
          const childMachine = childNode.data?.machine;
          const childCount   = childNode.data?.machineCount || 0;
          const isMineshaft  = childRecipe?.isMineshaftDrill || childRecipe?.id === 'r_mineshaft_drill';
          const ct           = getCycleTime(childRecipe, childMachine);
          const output       = childRecipe?.outputs?.[outputIdx];
          const produced     = output && typeof output.quantity === 'number'
            ? (isMineshaft ? output.quantity : output.quantity / ct) * childCount
            : 0;
          childScale = produced > 0 ? edgeFlow / produced : 1 / (outputEdgeCount.get(`${childId}:${outputIdx}`) || 1);
        } else {
          childScale = 1 / (outputEdgeCount.get(`${childId}:${outputIdx}`) || 1);
        }

        const isLastChild = i === children.length - 1;
        const childLineStates = [...lineStates, !isLastChild];

        const sharedProps = {
          node: childNode,
          depth: depth + 1,
          connectingOutputIdx: outputIdx,
          childrenOf,
          nodeMap,
          ancestorPath: newAncestorPath,
          onLocateNode,
          parentsOf,
          canonicalEdges,
          outputEdgeCount,
          scaleFactor: scaleFactor * childScale,
          productionSolution,
          lineStates: childLineStates,
          isLast: isLastChild,
        };

        // Non-canonical — already fully expanded elsewhere, show values but no children
        if (canonicalEdges && !canonicalEdges.has(`${node.id}->${childId}`)) {
          return <TreeRow key={`repeat-${childId}-${i}`} {...sharedProps} noExpand />;
        }

        return <TreeRow key={`${childId}-${depth}-${i}`} {...sharedProps} />;
      })}
    </>
  );
};

const TreeRow = React.memo(TreeRowInner);

// ─── Tree Tab ─────────────────────────────────────────────────────────────────

const TreeTab = ({ nodes, edges, onLocateNode, productionSolution }) => {
  const { roots, childrenOf, nodeMap, parentsOf, outputEdgeCount } = useMemo(() => {
    const targetNodeIds = new Set(nodes.filter(n => n.data?.isTarget).map(n => n.id));
    return buildTree(nodes, edges, targetNodeIds);
  }, [nodes, edges]);

  const canonicalEdgesByRoot = useMemo(() => {
    const map = new Map();
    roots.forEach(root => map.set(root.id, computeCanonicalEdges(root.id, childrenOf)));
    return map;
  }, [roots, childrenOf]);

  if (nodes.length === 0) return <div className="empty-state">No recipes on canvas.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(90vh - 230px)' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {roots.length} root node{roots.length !== 1 ? 's' : ''} · click ▼/▶ to collapse
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-primary)',
          borderTop: '1px solid var(--border-light)',
          position: 'sticky', top: 0, zIndex: 2, minWidth: TOTAL_WIDTH,
        }}>
          <div style={{ ...HEADER_STYLE, width: COL.product, flexShrink: 0 }}>Product</div>
          <div style={{ ...HEADER_STYLE, width: COL.rate, flexShrink: 0, textAlign: 'right' }}>Rate/s</div>
          <div style={{ ...HEADER_STYLE, width: COL.machine, flexShrink: 0 }}>Machine</div>
          <div style={{ ...HEADER_STYLE, width: COL.count, flexShrink: 0, textAlign: 'right' }}>Count</div>
          <div style={{ ...HEADER_STYLE, width: COL.power, flexShrink: 0, textAlign: 'right' }}>Power</div>
          <div style={{ ...HEADER_STYLE, width: COL.pollution, flexShrink: 0, textAlign: 'right' }}>Pollution</div>
          <div style={{ ...HEADER_STYLE, width: COL.cost, flexShrink: 0, textAlign: 'right' }}>Cost</div>
        </div>

        {/* Rows */}
        {roots.length === 0 ? (
          <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>
            No recipes on canvas.
          </div>
        ) : roots.map(root => (
          <TreeRow
            key={root.id}
            node={root}
            depth={0}
            connectingOutputIdx={null}
            childrenOf={childrenOf}
            nodeMap={nodeMap}
            ancestorPath=""
            onLocateNode={onLocateNode}
            parentsOf={parentsOf}
            canonicalEdges={canonicalEdgesByRoot.get(root.id)}
            outputEdgeCount={outputEdgeCount}
            scaleFactor={1}
            productionSolution={productionSolution}
            lineStates={[]}
            isLast={true}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const RecipesModal = ({
  onClose, tab, onTabChange,
  activeWeights, unusedWeights, setActiveWeights, setUnusedWeights,
  targetProducts, productionSolution,
  nodes, edges,
  recipeTabFilter, setRecipeTabFilter,
  onLocateNode,
}) => {
  const tabBtn = (id, label) => (
    <button
      onClick={() => onTabChange(id)}
      className={tab === id ? 'btn btn-primary' : 'btn btn-secondary'}
      style={{ flex: 1, borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', borderBottom: tab === id ? '3px solid var(--color-primary)' : 'none', minWidth: 'auto' }}
    >
      {label}
    </button>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '1400px', maxWidth: '95vw', maxHeight: '90vh' }}>
        <h2 className="modal-title">Recipes</h2>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid var(--border-divider)' }}>
          {tabBtn('targets', 'Solver & Targets')}
          {tabBtn('canvas', 'Canvas Recipes')}
        </div>

        {tab === 'targets' ? (
          <SolverTab
            activeWeights={activeWeights}
            unusedWeights={unusedWeights}
            setActiveWeights={setActiveWeights}
            setUnusedWeights={setUnusedWeights}
            targetProducts={targetProducts}
            nodes={nodes}
            productionSolution={productionSolution}
          />
        ) : (
          <TreeTab
            nodes={nodes}
            edges={edges}
            recipeTabFilter={recipeTabFilter}
            setRecipeTabFilter={setRecipeTabFilter}
            productionSolution={productionSolution}
            onLocateNode={onLocateNode}
          />
        )}

        <button onClick={onClose} className="btn btn-secondary" style={{ width: '100%', marginTop: '16px' }}>
          Close
        </button>
      </div>
    </div>
  );
};

export default RecipesModal;