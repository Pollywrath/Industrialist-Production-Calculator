import React from 'react';
import { formatPowerDisplay, metricFormat } from '../utils/appUtilities';

const LeftPanel = ({
  stats,
  leftPanelCollapsed,
  setLeftPanelCollapsed,
  extendedPanelOpen,
  setExtendedPanelOpen,
  openRecipeSelector,
  setShowTargetsModal,
  targetProductsCount,
  handleCompute,
  statisticsTitle
}) => {
  return (
    <div className={`left-panel-container ${leftPanelCollapsed ? 'collapsed' : ''}`}>
      <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
          <div className="stats-panel">
            <h3 className="stats-title">{statisticsTitle}</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-label">Total Power:</div>
                <div className="stat-value">{formatPowerDisplay(stats.totalPower)}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Total Pollution:</div>
                <div className="stat-value" style={{ color: stats.totalPollution >= 0 ? 'var(--stat-negative)' : 'var(--stat-positive)' }}>
                  {stats.totalPollution.toFixed(2)}%/hr
                </div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Total Minimum Model Count:</div>
                <div className="stat-value">{stats.totalModelCount.toFixed(0)}</div>
              </div>
              <div className="stat-item">
                <div className="stat-label">Total Profit:</div>
                <div className="stat-value" style={{ color: stats.totalProfit >= 0 ? 'var(--stat-positive)' : 'var(--stat-negative)' }}>
                  ${metricFormat(stats.totalProfit)}/s
                </div>
              </div>
            </div>
          </div>
          <div className="flex-col action-buttons-container">
            <button onClick={openRecipeSelector} className="btn btn-primary">
              + Select Recipe
            </button>
            <button onClick={() => setShowTargetsModal(true)} className="btn btn-secondary">
              View Targets ({targetProductsCount})
            </button>
            <button onClick={handleCompute} className="btn btn-secondary">
              Compute Machines
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setExtendedPanelOpen(!extendedPanelOpen)} 
                className="btn btn-secondary btn-square"
                title={extendedPanelOpen ? "Close more statistics" : "Open more statistics"}
              >
                {extendedPanelOpen ? '↓' : '↑'}
              </button>
              <button 
                onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)} 
                className="btn btn-secondary btn-square btn-panel-toggle"
                title={leftPanelCollapsed ? "Show left panel" : "Hide left panel"}
              >
                {leftPanelCollapsed ? '→' : '←'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeftPanel;