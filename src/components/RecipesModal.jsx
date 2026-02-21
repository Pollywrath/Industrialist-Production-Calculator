import React, { useState, useMemo } from 'react';
import { getProductName } from '../utils/variableHandler';
import { getProduct } from '../data/dataLoader';
import { formatPowerDisplay, smartFormat } from '../utils/appUtilities';
import {
  hasTempDependentCycle, TEMP_DEPENDENT_MACHINES, recipeUsesSteam,
  getTempDependentCycleTime, DEFAULT_STEAM_TEMPERATURE
} from '../utils/temperatureUtils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
  let cycleTime = recipe.cycle_time;
  if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
  if (machine && hasTempDependentCycle(machine.id)) {
    const tempInfo = TEMP_DEPENDENT_MACHINES[machine.id];
    if (tempInfo?.type === 'steam_input' && recipeUsesSteam(recipe)) {
      const inputTemp = recipe.tempDependentInputTemp ?? DEFAULT_STEAM_TEMPERATURE;
      cycleTime = getTempDependentCycleTime(machine.id, inputTemp, cycleTime);
    }
  }
  if (typeof cycleTime !== 'number' || cycleTime <= 0) cycleTime = 1;
  return cycleTime;
};

const getNodePower = (recipe, machineCount) => {
  const power = recipe.power_consumption;
  if (typeof power === 'number') return formatPowerDisplay(power * machineCount);
  if (typeof power === 'object' && power !== null && 'max' in power)
    return formatPowerDisplay(power.max * machineCount) + ' max';
  return 'Var';
};

const getNodePollution = (recipe, machineCount) => {
  if (typeof recipe.pollution !== 'number') return '—';
  const total = recipe.pollution * machineCount;
  return fmt(total, 3) + '%/hr';
};

const getNodeCost = (machine, machineCount) => {
  if (typeof machine?.cost !== 'number') return '—';
  return '$' + fmt(Math.ceil(machineCount) * machine.cost);
};

// ─── Weight Donut Chart ───────────────────────────────────────────────────────

const WEIGHT_COLORS = {
  Deficiencies: 'var(--handle-input-deficient)',
  'Model Count': 'var(--color-primary)',
  Excesses:     'var(--tier-5-color)',
  Pollution:    'var(--handle-output-excess)',
  Power:        'var(--tier-3-color)',
  Cost:         'var(--tier-4-color)',
};

const WeightDonut = ({ activeWeights }) => {
  const SIZE = 140;
  const R = 52;
  const STROKE = 18;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const circumference = 2 * Math.PI * R;

  // Use rank-based proportions so the chart is readable (not 99.9% for top weight)
  const N = activeWeights.length;
  const rankSizes = activeWeights.map((_, i) => N - i); // [N, N-1, ..., 1]
  const total = rankSizes.reduce((a, b) => a + b, 0);
  const proportions = rankSizes.map(s => s / total);

  let offset = 0;
  const segments = activeWeights.map((w, i) => {
    const dashLen = proportions[i] * circumference;
    const seg = { weight: w, color: WEIGHT_COLORS[w] || '#888', dash: dashLen, gap: circumference - dashLen, offset };
    offset += dashLen;
    return seg;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <svg width={SIZE} height={SIZE} style={{ transform: 'rotate(-90deg)' }}>
        {segments.map(seg => (
          <circle
            key={seg.weight}
            cx={cx} cy={cy} r={R}
            fill="none"
            stroke={seg.color}
            strokeWidth={STROKE}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={-seg.offset}
            style={{ transition: 'stroke-dasharray 0.4s' }}
          />
        ))}
        {/* Center ring decoration */}
        <circle cx={cx} cy={cy} r={R - STROKE / 2 - 4} fill="var(--bg-secondary)" />
        <circle cx={cx} cy={cy} r={R + STROKE / 2 + 2} fill="none" stroke="var(--border-light)" strokeWidth={1} />
      </svg>
      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', width: '100%' }}>
        {activeWeights.map((w, i) => (
          <div key={w} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
              background: WEIGHT_COLORS[w] || '#888'
            }} />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.2 }}>{w}</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {(proportions[i] * 100).toFixed(0)}%
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

const SolverTab = ({
  activeWeights, unusedWeights, setActiveWeights, setUnusedWeights,
  targetProducts, nodes, productionSolution,
  hasTempDependentCycle: _htd, TEMP_DEPENDENT_MACHINES: _tdm,
}) => {
  const TIER_BASE = 1000;
  const allWeights = [...activeWeights, ...unusedWeights];

  const btnBase = {
    width: '24px', height: '24px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-primary)',
    background: 'var(--bg-main)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: '14px',
    lineHeight: 1,
    flexShrink: 0,
    transition: 'opacity 0.15s',
    padding: 0,
  };

  const totalActive = activeWeights.length;

  return (
    <div style={{ display: 'flex', gap: '0', height: 'calc(90vh - 180px)' }}>

      {/* ── Solver Config (full width, horizontal inner layout) ── */}
      <div style={{ flex: 1, display: 'flex', gap: '32px' }}>

        {/* Donut chart column */}
        <div style={{ flex: '0 0 260px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-lg)', fontWeight: 700, textAlign: 'center', margin: 0 }}>
            Solver Configuration
          </h3>
          <div style={{
            background: 'var(--bg-main)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)', padding: '20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            flex: 1
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Objective Priority Influence
            </div>
            <WeightDonut activeWeights={activeWeights} />
          </div>
          <button
            onClick={() => {
              setActiveWeights(['Deficiencies', 'Model Count', 'Excesses', 'Pollution', 'Power', 'Cost']);
              setUnusedWeights([]);
            }}
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
          {allWeights.map((weight) => {
            const isActive = activeWeights.includes(weight);
            const isDeficiencies = weight === 'Deficiencies';
            const activeIndex = activeWeights.indexOf(weight);

            const borderColor = isActive ? 'var(--color-primary)' : 'var(--border-light)';

            const canMoveUp = isActive && !isDeficiencies && activeIndex > 1;
            const canMoveDown = isActive && !isDeficiencies && activeIndex < totalActive - 1;

            const moveUp = () => setActiveWeights(prev => {
              const next = [...prev];
              const i = next.indexOf(weight);
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              return next;
            });
            const moveDown = () => setActiveWeights(prev => {
              const next = [...prev];
              const i = next.indexOf(weight);
              [next[i + 1], next[i]] = [next[i], next[i + 1]];
              return next;
            });
            const toggleUsed = () => {
              if (isActive) {
                setActiveWeights(prev => prev.filter(w => w !== weight));
                setUnusedWeights(prev => [...prev, weight]);
              } else {
                setUnusedWeights(prev => prev.filter(w => w !== weight));
                setActiveWeights(prev => [...prev, weight]);
              }
            };

            return (
              <div
                key={weight}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '6px 8px',
                  background: 'var(--bg-secondary)',
                  border: `2px solid ${borderColor}`,
                  borderRadius: 'var(--radius-sm)',
                  opacity: isActive ? 1 : 0.45,
                  transition: 'opacity 0.2s, border-color 0.2s',
                }}
              >
                {/* Color dot */}
                <div style={{
                  width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                  background: WEIGHT_COLORS[weight] || '#888',
                  opacity: isActive ? 1 : 0.5,
                }} />

                {/* Up/down */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <button onClick={moveUp} disabled={!canMoveUp}
                    style={{ ...btnBase, opacity: canMoveUp ? 1 : 0.2, cursor: canMoveUp ? 'pointer' : 'default' }}
                    title="Move up">↑</button>
                  <button onClick={moveDown} disabled={!canMoveDown}
                    style={{ ...btnBase, opacity: canMoveDown ? 1 : 0.2, cursor: canMoveDown ? 'pointer' : 'default' }}
                    title="Move down">↓</button>
                </div>

                {/* Label */}
                <span style={{
                  flex: 1, fontWeight: 600, fontSize: '12px',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  userSelect: 'none',
                }}>
                  {weight}
                </span>

                {/* Toggle */}
                <button
                  onClick={isDeficiencies ? undefined : toggleUsed}
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

// ─── Tree Tab ─────────────────────────────────────────────────────────────────

const buildTree = (nodes, edges) => {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // childrenOf[parentId] = [{ childId, outputIdx }]
  // "children" are nodes whose outputs feed into parentId
  const childrenOf = new Map();
  nodes.forEach(n => childrenOf.set(n.id, []));

  // parentsOf[childId] = Set<parentId>
  const parentsOf = new Map();
  nodes.forEach(n => parentsOf.set(n.id, new Set()));

  edges.forEach(edge => {
    const outputIdx = parseInt(edge.sourceHandle?.split('-')[1] ?? '0');
    if (childrenOf.has(edge.target)) {
      childrenOf.get(edge.target).push({ childId: edge.source, outputIdx });
    }
    if (parentsOf.has(edge.source)) {
      parentsOf.get(edge.source).add(edge.target);
    }
  });

  // Shared nodes = consumed by more than one parent → promoted to roots
  const sharedNodeIds = new Set(
    nodes.filter(n => parentsOf.get(n.id).size > 1).map(n => n.id)
  );

  // Roots = nodes with no parents OR shared nodes
  const naturalRootIds = new Set(nodes.filter(n => parentsOf.get(n.id).size === 0).map(n => n.id));
  const roots = nodes.filter(n => naturalRootIds.has(n.id) || sharedNodeIds.has(n.id));

  return { roots, childrenOf, nodeMap, sharedNodeIds, naturalRootIds };
};

// Column widths (px)
const COL = {
  product:  360,
  rate:      90,
  machine:  170,
  count:     70,
  power:    110,
  pollution: 90,
  cost:      90,
};
const TOTAL_WIDTH = Object.values(COL).reduce((a, b) => a + b, 0);

const HEADER_STYLE = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  padding: '4px 6px', userSelect: 'none', letterSpacing: '0.04em',
  textTransform: 'uppercase',
};

const CELL_STYLE = {
  fontSize: '12px', color: 'var(--text-secondary)',
  padding: '3px 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const TreeRow = ({ node, depth, connectingOutputIdx, childrenOf, nodeMap, ancestorIds, onLocateNode, sharedNodeIds, naturalRootIds, productionSolution }) => {
  const [collapsed, setCollapsed] = useState(false);
  const { recipe, machine, machineCount = 0 } = node.data || {};
  if (!recipe || !machine) return null;

  const isMineshaftDrill = recipe.isMineshaftDrill || recipe.id === 'r_mineshaft_drill';
  const cycleTime = getCycleTime(recipe, machine);

  // Product to display = connecting output to parent, or first output
  const displayOutput = connectingOutputIdx != null
    ? recipe.outputs?.[connectingOutputIdx]
    : recipe.outputs?.[0];

  const productName = displayOutput
    ? getProductName(displayOutput.product_id, getProduct)
    : recipe.name;

  let rate = 0;
  if (displayOutput && typeof displayOutput.quantity === 'number') {
    rate = isMineshaftDrill
      ? displayOutput.quantity * machineCount
      : (displayOutput.quantity / cycleTime) * machineCount;
  }

  const power = getNodePower(recipe, machineCount);
  const pollution = getNodePollution(recipe, machineCount);
  const cost = getNodeCost(machine, machineCount);

  const children = childrenOf.get(node.id) || [];
  const hasChildren = children.length > 0;

  // Prevent infinite loops on cyclic graphs
  const newAncestorIds = new Set([...ancestorIds, node.id]);

  const indentPx = depth * 18;

  const tierColor = machine.tier === 1 ? 'var(--tier-1-color)'
    : machine.tier === 2 ? 'var(--tier-2-color)'
    : machine.tier === 3 ? 'var(--tier-3-color)'
    : machine.tier === 4 ? 'var(--tier-4-color)'
    : 'var(--tier-5-color)';

  // Excess/deficiency detection for row tinting
  const flows = productionSolution?.flows?.byNode[node.id];
  let hasExcess = false, hasDeficiency = false;
  if (flows) {
    recipe.inputs.forEach((input, idx) => {
      if (typeof input.quantity !== 'number') return;
      const needed = isMineshaftDrill ? input.quantity * machineCount : (input.quantity / cycleTime) * machineCount;
      const connected = flows.inputFlows?.[idx]?.connected || 0;
      if (needed - connected > 0.001) hasDeficiency = true;
    });
    recipe.outputs.forEach((output, idx) => {
      const qty = output.originalQuantity ?? output.quantity;
      if (typeof qty !== 'number') return;
      const produced = isMineshaftDrill ? qty * machineCount : (qty / cycleTime) * machineCount;
      const connected = flows.outputFlows?.[idx]?.connected || 0;
      if (produced - connected > 0.001) hasExcess = true;
    });
  }

  const baseRowBg = depth === 0
    ? 'var(--bg-secondary)'
    : depth % 2 === 0 ? 'var(--bg-main)' : 'rgba(255,255,255,0.015)';

  const rowBg = hasDeficiency
    ? 'color-mix(in srgb, var(--handle-input-deficient) 9%, transparent)'
    : hasExcess
    ? 'color-mix(in srgb, var(--handle-output-excess) 9%, transparent)'
    : baseRowBg;

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          background: rowBg,
          borderBottom: '1px solid var(--border-light)',
          minWidth: TOTAL_WIDTH,
          borderLeft: depth === 0
            ? '3px solid var(--color-primary)'
            : '3px solid transparent',
        }}
      >
        {/* Product column */}
        <div style={{ ...CELL_STYLE, width: COL.product, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
          {/* Indent */}
          {depth > 0 && (
            <span style={{ display: 'inline-block', width: indentPx, flexShrink: 0 }} />
          )}
          {/* Collapse toggle */}
          {hasChildren ? (
            <button
              onClick={() => setCollapsed(c => !c)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-primary)', fontSize: '10px',
                padding: '0 2px', flexShrink: 0, lineHeight: 1,
              }}
              title={collapsed ? 'Expand' : 'Collapse'}
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
        <div style={{ ...CELL_STYLE, width: COL.rate, flexShrink: 0, textAlign: 'right', color: 'var(--stat-value)', fontFamily: 'monospace' }}>
          {fmt(rate, 4)}/s
        </div>

        {/* Machine */}
        <div style={{ ...CELL_STYLE, width: COL.machine, flexShrink: 0 }}>
          <span
            onClick={() => onLocateNode && onLocateNode(node.id)}
            style={{
              color: tierColor, fontWeight: 500, fontSize: '12px',
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
          {fmt(machineCount, 3)}
        </div>

        {/* Power */}
        <div style={{ ...CELL_STYLE, width: COL.power, flexShrink: 0, textAlign: 'right', color: 'var(--tier-3-color)' }}>
          {power}
        </div>

        {/* Pollution */}
        <div style={{ ...CELL_STYLE, width: COL.pollution, flexShrink: 0, textAlign: 'right', color: 'var(--stat-positive)' }}>
          {pollution}
        </div>

        {/* Cost */}
        <div style={{ ...CELL_STYLE, width: COL.cost, flexShrink: 0, textAlign: 'right', color: 'var(--stat-value)' }}>
          {cost}
        </div>
      </div>

      {!collapsed && children.map(({ childId, outputIdx }, i) => {
        // Shared node reference stub — shown as a link instead of full subtree
        if (sharedNodeIds?.has(childId) && !ancestorIds.has(childId)) {
          const sharedNode = nodeMap.get(childId);
          const sharedRecipe = sharedNode?.data?.recipe;
          const sharedMachine = sharedNode?.data?.machine;
          const sharedMachineCount = sharedNode?.data?.machineCount || 0;
          const sharedOutput = outputIdx != null ? sharedRecipe?.outputs?.[outputIdx] : sharedRecipe?.outputs?.[0];
          const sharedProductName = sharedOutput
            ? getProductName(sharedOutput.product_id, getProduct)
            : sharedRecipe?.name || childId;
          const isMineshaftDrillShared = sharedRecipe?.isMineshaftDrill || sharedRecipe?.id === 'r_mineshaft_drill';
          const sharedCycleTime = sharedRecipe && sharedMachine ? getCycleTime(sharedRecipe, sharedMachine) : 1;
          let sharedRate = 0;
          if (sharedOutput && typeof sharedOutput.quantity === 'number') {
            sharedRate = isMineshaftDrillShared
              ? sharedOutput.quantity * sharedMachineCount
              : (sharedOutput.quantity / sharedCycleTime) * sharedMachineCount;
          }
          const sharedTierColor = sharedMachine?.tier === 1 ? 'var(--tier-1-color)'
            : sharedMachine?.tier === 2 ? 'var(--tier-2-color)'
            : sharedMachine?.tier === 3 ? 'var(--tier-3-color)'
            : sharedMachine?.tier === 4 ? 'var(--tier-4-color)'
            : 'var(--tier-5-color)';
          const sharedIndentPx = (depth + 1) * 18;
          return (
            <div key={`shared-${childId}-${i}`} style={{
              display: 'flex', alignItems: 'center',
              background: 'color-mix(in srgb, var(--color-primary) 7%, transparent)',
              borderBottom: '1px solid var(--border-light)',
              borderLeft: '3px solid var(--color-primary)',
              minWidth: TOTAL_WIDTH,
            }}>
              {/* Product column */}
              <div style={{ ...CELL_STYLE, width: COL.product, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ display: 'inline-block', width: sharedIndentPx, flexShrink: 0 }} />
                <span style={{ width: '14px', flexShrink: 0 }} />
                <span style={{
                  color: 'var(--text-secondary)', fontStyle: 'italic',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontSize: '12px',
                }}>
                  {sharedProductName}
                </span>
              </div>
              {/* Rate */}
              <div style={{ ...CELL_STYLE, width: COL.rate, flexShrink: 0, textAlign: 'right', color: 'var(--stat-value)', fontFamily: 'monospace' }}>
                {fmt(sharedRate, 4)}/s
              </div>
              {/* Machine */}
              <div style={{ ...CELL_STYLE, width: COL.machine, flexShrink: 0 }}>
                {sharedMachine && (
                  <span style={{ color: sharedTierColor, fontWeight: 500, fontSize: '12px' }}>
                    {sharedMachine.name}
                  </span>
                )}
              </div>
              {/* Count */}
              <div style={{ ...CELL_STYLE, width: COL.count, flexShrink: 0, textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-primary)' }}>
                {fmt(sharedMachineCount, 3)}
              </div>
              <div style={{ ...CELL_STYLE, width: COL.power, flexShrink: 0 }} />
              <div style={{ ...CELL_STYLE, width: COL.pollution, flexShrink: 0 }} />
              <div style={{ ...CELL_STYLE, width: COL.cost, flexShrink: 0 }} />
            </div>
          );
        }
        if (ancestorIds.has(childId)) {
          const cycleNode = nodeMap.get(childId);
          const cycleRecipe = cycleNode?.data?.recipe;
          const cycleMachine = cycleNode?.data?.machine;
          const cycleOutput = outputIdx != null ? cycleRecipe?.outputs?.[outputIdx] : cycleRecipe?.outputs?.[0];
          const cycleProductName = cycleOutput
            ? getProductName(cycleOutput.product_id, getProduct)
            : cycleRecipe?.name || childId;
          const cycleTierColor = cycleMachine?.tier === 1 ? 'var(--tier-1-color)'
            : cycleMachine?.tier === 2 ? 'var(--tier-2-color)'
            : cycleMachine?.tier === 3 ? 'var(--tier-3-color)'
            : cycleMachine?.tier === 4 ? 'var(--tier-4-color)'
            : 'var(--tier-5-color)';
          const cycleIndentPx = (depth + 1) * 18;
          return (
            <div key={`cycle-${childId}-${i}`} style={{
              display: 'flex', alignItems: 'center',
              background: 'color-mix(in srgb, var(--tier-4-color) 7%, transparent)',
              borderBottom: '1px solid var(--border-light)',
              borderLeft: '3px solid var(--tier-4-color)',
              minWidth: TOTAL_WIDTH,
            }}>
              {/* Product column */}
              <div style={{ ...CELL_STYLE, width: COL.product, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ display: 'inline-block', width: cycleIndentPx, flexShrink: 0 }} />
                <span style={{ width: '14px', flexShrink: 0 }} />
                <span style={{
                  color: 'var(--tier-4-color)', fontStyle: 'italic',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontSize: '12px',
                }}>
                  {cycleProductName}
                </span>
              </div>
              {/* Rate placeholder */}
              <div style={{ ...CELL_STYLE, width: COL.rate, flexShrink: 0, textAlign: 'right', color: 'var(--tier-4-color)', fontSize: '11px', fontStyle: 'italic' }}>
                cycle
              </div>
              {/* Machine */}
              <div style={{ ...CELL_STYLE, width: COL.machine, flexShrink: 0 }}>
                {cycleMachine && (
                  <span
                    onClick={() => onLocateNode && onLocateNode(childId)}
                    style={{
                      color: cycleTierColor, fontWeight: 500, fontSize: '12px',
                      cursor: onLocateNode ? 'pointer' : 'default',
                      textDecoration: onLocateNode ? 'underline dotted' : 'none',
                      textUnderlineOffset: '3px',
                    }}
                    title={onLocateNode ? `Locate ${cycleMachine.name} on canvas` : undefined}
                  >
                    {cycleMachine.name}
                  </span>
                )}
              </div>
              {/* Remaining columns empty */}
              <div style={{ ...CELL_STYLE, width: COL.count, flexShrink: 0 }} />
              <div style={{ ...CELL_STYLE, width: COL.power, flexShrink: 0 }} />
              <div style={{ ...CELL_STYLE, width: COL.pollution, flexShrink: 0 }} />
              <div style={{ ...CELL_STYLE, width: COL.cost, flexShrink: 0 }} />
            </div>
          );
        }
        const childNode = nodeMap.get(childId);
        if (!childNode) return null;
        return (
          <TreeRow
            key={`${childId}-${depth}-${i}`}
            node={childNode}
            depth={depth + 1}
            connectingOutputIdx={outputIdx}
            childrenOf={childrenOf}
            nodeMap={nodeMap}
            ancestorIds={newAncestorIds}
            onLocateNode={onLocateNode}
            sharedNodeIds={sharedNodeIds}
            naturalRootIds={naturalRootIds}
            productionSolution={productionSolution}
          />
        );
      })}
    </>
  );
};

const TreeTab = ({ nodes, edges, recipeTabFilter, setRecipeTabFilter, productionSolution, onLocateNode }) => {
  const { roots, childrenOf, nodeMap, sharedNodeIds, naturalRootIds } = useMemo(() => buildTree(nodes, edges), [nodes, edges]);

  const filteredRoots = roots;

  if (nodes.length === 0) {
    return <div className="empty-state">No recipes on canvas.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(90vh - 230px)' }}>
      {/* Info bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {filteredRoots.length} root node{filteredRoots.length !== 1 ? 's' : ''} · click ▼/▶ to collapse
        </span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: 'var(--bg-secondary)',
          borderBottom: '2px solid var(--border-primary)',
          position: 'sticky', top: 0, zIndex: 2,
          minWidth: TOTAL_WIDTH,
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
        {filteredRoots.length === 0 ? (
          <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '13px' }}>
            No recipes match the current filter.
          </div>
        ) : (
          filteredRoots.map(root => (
            <TreeRow
              key={root.id}
              node={root}
              depth={0}
              connectingOutputIdx={null}
              childrenOf={childrenOf}
              nodeMap={nodeMap}
              ancestorIds={new Set()}
              onLocateNode={onLocateNode}
              sharedNodeIds={sharedNodeIds}
              naturalRootIds={naturalRootIds}
              productionSolution={productionSolution}
            />
          ))
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const RecipesModal = ({
  onClose,
  tab, onTabChange,
  // Solver tab props
  activeWeights, unusedWeights, setActiveWeights, setUnusedWeights,
  targetProducts, productionSolution,
  // Canvas tab props
  nodes, edges,
  recipeTabFilter, setRecipeTabFilter,
  onLocateNode,
}) => {
  const tabBtn = (id, label) => (
    <button
      onClick={() => onTabChange(id)}
      className={tab === id ? 'btn btn-primary' : 'btn btn-secondary'}
      style={{
        flex: 1,
        borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
        borderBottom: tab === id ? '3px solid var(--color-primary)' : 'none',
        minWidth: 'auto',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ width: '1400px', maxWidth: '95vw', maxHeight: '90vh' }}
      >
        <h2 className="modal-title">Recipes</h2>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid var(--border-divider)' }}>
          {tabBtn('targets', 'Solver & Targets')}
          {tabBtn('canvas', 'Canvas Recipes')}
        </div>

        {/* Content */}
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