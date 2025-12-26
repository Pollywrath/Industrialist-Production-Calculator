import React from 'react';

const RightPanel = ({
  menuOpen,
  setMenuOpen,
  onClearAll,
  onImport,
  onExportData,
  onExportCanvas,
  onRestoreDefaults,
  onThemeEditor
}) => {
  return (
    <div className={`menu-container ${menuOpen ? '' : 'closed'}`}>
      <button 
        onClick={() => setMenuOpen(!menuOpen)} 
        className="btn btn-secondary btn-menu-toggle"
      >
        {menuOpen ? '>' : '<'}
      </button>
      <div className="menu-buttons">
        <button onClick={onClearAll} className="btn btn-secondary">
          Clear All
        </button>
        <button onClick={onImport} className="btn btn-secondary">
          Import JSON
        </button>
        <button onClick={onExportData} className="btn btn-secondary">
          Export Data
        </button>
        <button onClick={onExportCanvas} className="btn btn-secondary">
          Export Canvas
        </button>
        <button onClick={onRestoreDefaults} className="btn btn-secondary">
          Restore Defaults
        </button>
        <button onClick={onThemeEditor} className="btn btn-secondary">
          Theme Editor
        </button>
        <button 
          onClick={() => window.open('https://github.com/Pollywrath/Industrialist-Production-Calculator', '_blank')} 
          className="btn btn-secondary"
        >
          Source Code
        </button>
      </div>
    </div>
  );
};

export default RightPanel;