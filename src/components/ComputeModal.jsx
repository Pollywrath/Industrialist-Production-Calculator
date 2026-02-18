import React, { useState, useEffect, useRef } from 'react';

const TIPS = [
  'Tip: Lock nodes to prevent the solver from changing their machine counts.',
  'Tip: Use Shift+Click on a node to mark it as a target recipe.',
  'Tip: Capped nodes will not exceed their set machine count during solving.',
  'Tip: Connect excess outputs to inputs of other machines to reduce waste.',
  'Tip: The LP solver prioritizes eliminating deficiencies above all else, other variables are compared using weighted sums.',
  'Tip: Adjust objective weights in the view recipes panel to change what the solver optimizes for — reorder or disable Model Count, Excesses, Pollution, Power, and Cost.',
  'Tip: Remove unused weights entirely to simplify the model — fewer active objectives means faster solving.',
  'Tip: Line types and paths can be changed in the Theme Editor to make complex networks easier to read.',
  'Tip: Excess and deficiency highlight colors are customizable in the Theme Editor — make them stand out more against your chosen theme.',
  'Tip: Add different ways of producing an item to see which is better, solver will pick the flow with the least cost according to weights used',
  'Tip: Double-click a handle to auto-balance a single connection without running the full solver.',
  'Tip: Middle-click a node to duplicate it — useful for quickly scaling up a production line.',
  'Tip: Use the per-second display mode to directly compare production rates across different recipe cycle times.',
];

const Spinner = () => {
  useEffect(() => {
    const id = 'lp-spinner-keyframes';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `
        @keyframes lp-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes lp-dot-fade { 0%, 100% { opacity: 0.15; } 50% { opacity: 1; } }
      `;
      document.head.appendChild(style);
    }
  }, []);

  const DOT_COUNT = 10;
  const RADIUS = 20;
  const CENTER = 26;

  return (
    <svg width="52" height="52" style={{ flexShrink: 0, animation: 'lp-spin 1.1s linear infinite', willChange: 'transform' }}>
      {Array.from({ length: DOT_COUNT }).map((_, i) => {
        const angle = (i / DOT_COUNT) * 2 * Math.PI - Math.PI / 2;
        const x = CENTER + RADIUS * Math.cos(angle);
        const y = CENTER + RADIUS * Math.sin(angle);
        const size = 2 + (i / (DOT_COUNT - 1)) * 3.5;
        const delay = -(i / DOT_COUNT) * 1.1;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={size / 2}
            fill="var(--color-primary)"
            style={{
              animation: `lp-dot-fade 1.1s ease-in-out ${delay}s infinite`,
              transformOrigin: `${x}px ${y}px`,
            }}
          />
        );
      })}
    </svg>
  );
};

const ComputeModal = ({ phase, nodeSnapshot, result, onCancel, onApply, onLocateNode }) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (phase !== 'loading') return;
    startRef.current = Date.now();
    setElapsedMs(0);
    const timer = setInterval(() => setElapsedMs(Date.now() - startRef.current), 100);
    const tipTimer = setInterval(() => setTipIndex(i => (i + 1) % TIPS.length), 4000);
    return () => { clearInterval(timer); clearInterval(tipTimer); };
  }, [phase]);

  const getNodeLabel = (nodeId) => {
    const node = nodeSnapshot?.find(n => n.id === nodeId);
    const machineName = node?.data?.machineName || '';
    const recipeName = node?.data?.recipe?.name || nodeId;
    return machineName ? `${machineName} – ${recipeName}` : recipeName;
  };

  const getMachineLabel = (nodeId) => {
    const node = nodeSnapshot?.find(n => n.id === nodeId);
    return node?.data?.machineName || node?.data?.recipe?.name || nodeId;
  };
  const getOldCount = (nodeId) =>
    nodeSnapshot?.find(n => n.id === nodeId)?.data?.machineCount || 0;
  const formatCount = (n) =>
    typeof n === 'number' ? (Number.isInteger(n) ? n.toString() : n.toFixed(3)) : '0';

  const sectionTitle = (text) => (
    <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
      {text}
    </div>
  );

  const infoRow = (label, value) => (
    <div key={label} style={{
      display: 'flex', justifyContent: 'space-between',
      background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)',
      padding: '6px 12px', fontSize: '12px'
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(value)}</span>
    </div>
  );

  const renderLoading = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', padding: '32px 24px' }}>
      <Spinner />
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>
          Solving Production Network...
        </div>
        <div style={{ color: 'var(--color-primary)', fontSize: '26px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {(elapsedMs / 1000).toFixed(1)}s
        </div>
      </div>
      <div style={{
        background: 'var(--bg-main)', border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-sm)', padding: '12px 16px',
        color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center',
        minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        maxWidth: '340px'
      }}>
        {TIPS[tipIndex]}
      </div>
      <button onClick={onCancel} className="btn btn-secondary" style={{ minWidth: '100px' }}>
        Cancel
      </button>
    </div>
  );

  const renderDeficiencyConfirm = () => {
    const deficientNodes = result?.deficientNodes || [];
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '28px' }}>⚠️</span>
          <div>
            <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700 }}>
              Insufficient Input Supply
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
              These recipes need more input than is currently being produced.
            </div>
          </div>
        </div>
        {deficientNodes.length > 0 && (
          <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {deficientNodes.map((d, i) => (
              <div key={i} style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)',
                borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '13px' }}>
                    {getMachineLabel(d.nodeId)}
                  </div>
                </div>
                <button
                  onClick={() => { onCancel(); onLocateNode(d.nodeId); }}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px', whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  Locate
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{
          color: 'var(--text-secondary)', fontSize: '13px',
          background: 'var(--bg-main)', padding: '10px 12px', borderRadius: 'var(--radius-sm)'
        }}>
          Add more production for the needed products or connect existing producers to resolve these deficiencies.
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="btn btn-primary">Close</button>
        </div>
      </div>
    );
  };

  const renderResults = () => {
    const updates = result?.updates;
    const hasChanges = updates && updates.size > 0;
    const changesArr = hasChanges
      ? Array.from(updates.entries()).sort((a, b) => getNodeLabel(a[0]).localeCompare(getNodeLabel(b[0])))
      : [];

    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '70vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>
            {result?.success ? '✅' : result?.solverError || result?.error ? '❌' : 'ℹ️'}
          </span>
          <div>
            <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 700 }}>
              {result?.success
                ? 'Computation Complete'
                : result?.solverError || result?.error
                  ? 'Solver Error'
                  : 'No Solution Found'}
            </div>
            <div style={{ color: result?.success ? 'var(--text-secondary)' : '#fca5a5', fontSize: '12px', marginTop: '2px' }}>
              {result?.message || result?.error || 'An unknown error occurred.'}
            </div>
          </div>
        </div>

        {/* Changes — hide entirely on solver error */}
        {!result?.solverError && !result?.error && <div>
          {sectionTitle(`Machine Count Changes (${changesArr.length})`)}
          {hasChanges ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '240px', overflowY: 'auto' }}>
              {changesArr.map(([nodeId, newCount]) => {
                const oldCount = getOldCount(nodeId);
                const delta = newCount - oldCount;
                return (
                  <div key={nodeId} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)',
                    padding: '7px 12px', fontSize: '13px'
                  }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500, marginRight: '12px' }}>
                      {getNodeLabel(nodeId)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{formatCount(oldCount)}</span>
                      <span style={{ color: 'var(--text-muted)' }}>→</span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatCount(newCount)}</span>
                      <span style={{ color: delta > 0 ? '#86efac' : '#fca5a5', fontSize: '11px', fontWeight: 600, minWidth: '40px', textAlign: 'right' }}>
                        {delta > 0 ? `+${formatCount(delta)}` : formatCount(delta)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              color: 'var(--text-secondary)', fontSize: '13px', padding: '10px 12px',
              background: 'var(--bg-main)', borderRadius: 'var(--radius-sm)'
            }}>
              No changes — network is already balanced.
            </div>
          )}
        </div>}

        {/* Solver Info */}
        <div>
          {sectionTitle('Solver Info')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {!result?.solverError && !result?.error && infoRow('Nodes Updated', changesArr.length)}
            {!result?.solverError && !result?.error && infoRow('Converged', result?.converged ? 'Yes' : 'No')}
            {!result?.solverError && !result?.error && infoRow('Iterations', result?.iterations ?? '—')}
            {result?.elapsedMs != null && infoRow('Solve Time', `${(result.elapsedMs / 1000).toFixed(2)}s`)}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} className="btn btn-secondary">Dismiss</button>
          {hasChanges && (
            <button onClick={() => onApply(result)} className="btn btn-primary">Apply Changes</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: '460px', padding: 0, overflow: 'hidden' }}>
        <div style={{
          background: 'var(--bg-secondary)', borderBottom: '2px solid var(--border-divider)',
          padding: '14px 20px'
        }}>
          <h2 className="modal-title" style={{ margin: 0 }}>
            {phase === 'loading' && '⚙️ LP Solver'}
            {phase === 'deficiency_confirm' && '⚠️ Insufficient Input Supply'}
            {phase === 'results' && '📊 Results'}
          </h2>
        </div>
        {phase === 'loading' && renderLoading()}
        {phase === 'deficiency_confirm' && renderDeficiencyConfirm()}
        {phase === 'results' && renderResults()}
      </div>
    </div>
  );
};

export default ComputeModal;