import React, { useState, useEffect } from 'react';

const SAVES_KEY = 'industrialist_saves';
const CURRENT_SAVE_KEY = 'industrialist_current_save_id';

// Utility functions for save management
export const getSaves = () => {
  try {
    const saves = localStorage.getItem(SAVES_KEY);
    return saves ? JSON.parse(saves) : {};
  } catch (error) {
    console.error('Error loading saves:', error);
    return {};
  }
};

export const saveCurrent = (name, canvasData) => {
  try {
    const saves = getSaves();
    const id = `save_${Date.now()}`;
    const save = {
      id,
      name: name || 'Untitled Save',
      timestamp: Date.now(),
      nodeCount: canvasData.nodes?.length || 0,
      data: canvasData
    };
    saves[id] = save;
    localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
    localStorage.setItem(CURRENT_SAVE_KEY, id);
    return save;
  } catch (error) {
    console.error('Error saving canvas:', error);
    return null;
  }
};

export const loadSave = (saveId) => {
  try {
    const saves = getSaves();
    const save = saves[saveId];
    if (save) {
      localStorage.setItem(CURRENT_SAVE_KEY, saveId);
      return save.data;
    }
    return null;
  } catch (error) {
    console.error('Error loading save:', error);
    return null;
  }
};

export const deleteSave = (saveId) => {
  try {
    const saves = getSaves();
    delete saves[saveId];
    localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
    
    // Clear current save if it was deleted
    const currentSaveId = localStorage.getItem(CURRENT_SAVE_KEY);
    if (currentSaveId === saveId) {
      localStorage.removeItem(CURRENT_SAVE_KEY);
    }
    return true;
  } catch (error) {
    console.error('Error deleting save:', error);
    return false;
  }
};

export const renameSave = (saveId, newName) => {
  try {
    const saves = getSaves();
    if (saves[saveId]) {
      saves[saveId].name = newName;
      localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error renaming save:', error);
    return false;
  }
};

export const getCurrentSaveName = () => {
  try {
    const currentSaveId = localStorage.getItem(CURRENT_SAVE_KEY);
    if (currentSaveId) {
      const saves = getSaves();
      return saves[currentSaveId]?.name || 'Untitled';
    }
    return 'Untitled';
  } catch (error) {
    return 'Untitled';
  }
};

const SaveManager = ({ onClose, onLoad, currentCanvas }) => {
  const [saves, setSaves] = useState({});
  const [saveName, setSaveName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [currentSaveId, setCurrentSaveId] = useState(null);

  useEffect(() => {
    loadSaves();
  }, []);

  const loadSaves = () => {
    const loadedSaves = getSaves();
    setSaves(loadedSaves);
    const currentId = localStorage.getItem(CURRENT_SAVE_KEY);
    setCurrentSaveId(currentId);
  };

  const handleSave = () => {
    if (!saveName.trim()) {
      alert('Please enter a name for your save');
      return;
    }

    const save = saveCurrent(saveName.trim(), currentCanvas);
    if (save) {
      setSaveName('');
      loadSaves();
      alert(`Canvas saved as "${save.name}"`);
    } else {
      alert('Failed to save canvas');
    }
  };

  const handleLoad = (saveId) => {
    if (!window.confirm('Load this save? Your current canvas will be replaced.')) {
      return;
    }

    const saveData = loadSave(saveId);
    if (saveData) {
      setCurrentSaveId(saveId);
      onLoad(saveData);
      onClose();
    } else {
      alert('Failed to load save');
    }
  };

  const handleDelete = (saveId) => {
    const save = saves[saveId];
    if (!window.confirm(`Delete save "${save.name}"? This cannot be undone.`)) {
      return;
    }

    if (deleteSave(saveId)) {
      loadSaves();
    } else {
      alert('Failed to delete save');
    }
  };

  const handleRename = (saveId) => {
    setRenamingId(saveId);
    setRenameValue(saves[saveId].name);
  };

  const handleRenameSubmit = (saveId) => {
    if (!renameValue.trim()) {
      alert('Name cannot be empty');
      return;
    }

    if (renameSave(saveId, renameValue.trim())) {
      loadSaves();
      setRenamingId(null);
      setRenameValue('');
    } else {
      alert('Failed to rename save');
    }
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  const savesList = Object.values(saves).sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '700px', maxHeight: '85vh' }}>
        <h2 className="modal-title">Save Manager</h2>

        <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', border: '2px solid var(--border-divider)' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '10px' }}>
            Current Canvas: <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{getCurrentSaveName()}</span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Enter save name..."
              className="input"
              style={{ flex: 1 }}
            />
            <button onClick={handleSave} className="btn btn-primary" style={{ minWidth: '120px' }}>
              Save Current
            </button>
          </div>
        </div>

        <div className="modal-content" style={{ maxHeight: 'calc(85vh - 250px)', overflowY: 'auto' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
            Saved Canvases ({savesList.length})
          </h3>

          {savesList.length === 0 ? (
            <div className="empty-state">No saves yet. Save your current canvas to get started.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {savesList.map(save => (
                <div
                  key={save.id}
                  style={{
                    padding: '15px',
                    background: currentSaveId === save.id ? 'rgba(212, 166, 55, 0.15)' : 'var(--bg-main)',
                    border: currentSaveId === save.id ? '2px solid var(--color-primary)' : '2px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all 0.2s'
                  }}
                >
                  {renamingId === save.id ? (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleRenameSubmit(save.id);
                            if (e.key === 'Escape') handleRenameCancel();
                          }}
                          className="input"
                          style={{ flex: 1 }}
                          autoFocus
                        />
                        <button onClick={() => handleRenameSubmit(save.id)} className="btn btn-primary" style={{ padding: '8px 16px' }}>
                          ✓
                        </button>
                        <button onClick={handleRenameCancel} className="btn btn-secondary" style={{ padding: '8px 16px' }}>
                          ✗
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>
                          {save.name}
                          {currentSaveId === save.id && (
                            <span style={{ 
                              marginLeft: '8px', 
                              fontSize: '11px', 
                              color: 'var(--color-primary)', 
                              fontWeight: 600,
                              padding: '2px 6px',
                              background: 'rgba(212, 166, 55, 0.2)',
                              borderRadius: '4px'
                            }}>
                              CURRENT
                            </span>
                          )}
                        </div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                          {formatDate(save.timestamp)} • {save.nodeCount} nodes
                        </div>
                      </div>
                    </div>
                  )}

                  {renamingId !== save.id && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        onClick={() => handleLoad(save.id)} 
                        className="btn btn-primary" 
                        style={{ flex: 1, padding: '8px 16px' }}
                      >
                        Load
                      </button>
                      <button 
                        onClick={() => handleRename(save.id)} 
                        className="btn btn-secondary" 
                        style={{ flex: 1, padding: '8px 16px' }}
                      >
                        Rename
                      </button>
                      <button 
                        onClick={() => handleDelete(save.id)} 
                        className="btn btn-delete" 
                        style={{ padding: '8px 16px' }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={onClose} className="btn btn-secondary" style={{ marginTop: '20px', width: '100%' }}>
          Close
        </button>
      </div>
    </div>
  );
};

export default SaveManager;