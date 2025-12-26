import React from 'react';

const MachineCountEditor = ({
  show,
  editingMachineCount,
  setEditingMachineCount,
  onUpdate,
  onCancel
}) => {
  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
        <h2 className="modal-title">Edit Machine Count</h2>
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-base)',
            fontWeight: 600,
            marginBottom: '10px'
          }}>
            Machine Count:
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={editingMachineCount}
            onChange={(e) => setEditingMachineCount(e.target.value)}
            onKeyPress={(e) => { if (e.key === 'Enter') onUpdate(); }}
            className="input"
            placeholder="Enter machine count"
            autoFocus
          />
          <p style={{
            marginTop: '8px',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)'
          }}>
            Must be a non-negative number (can be decimal)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} className="btn btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
          <button onClick={onUpdate} className="btn btn-primary" style={{ flex: 1 }}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default MachineCountEditor;