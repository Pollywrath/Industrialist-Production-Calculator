import React, { useState, useEffect } from 'react';
import { getSaves, saveCurrent, loadSave, deleteSave, renameSave, getCurrentSaveName } from '../utils/saveDB';

// Re-export for backwards compatibility (now async)
export { getSaves, saveCurrent, loadSave, deleteSave, renameSave, getCurrentSaveName };

const SaveManager = ({ onClose, onLoad, currentCanvas, onImport, onExportCanvas }) => {
  const [saves, setSaves] = useState({});
  const [saveName, setSaveName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [currentSaveId, setCurrentSaveId] = useState(null);
  const [currentSaveNameDisplay, setCurrentSaveNameDisplay] = useState('Untitled');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSaves();
  }, []);

  const loadSaves = async () => {
    setIsLoading(true);
    try {
      const loadedSaves = await getSaves();
      setSaves(loadedSaves);
      const currentId = localStorage.getItem('industrialist_current_save_id');
      setCurrentSaveId(currentId);
      const currentName = await getCurrentSaveName();
      setCurrentSaveNameDisplay(currentName);
    } catch (error) {
      console.error('Error loading saves:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!saveName.trim()) {
      alert('Please enter a name for your save');
      return;
    }

    setIsSaving(true);
    try {
      const save = await saveCurrent(saveName.trim(), currentCanvas);
      if (save) {
        setSaveName('');
        await loadSaves();
        alert(`Canvas saved as "${save.name}"`);
      } else {
        alert('Failed to save canvas');
      }
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save canvas');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoad = async (saveId) => {
    if (!window.confirm('Load this save? Your current canvas will be replaced.')) {
      return;
    }

    setIsLoading(true);
    try {
      const saveData = await loadSave(saveId);
      if (saveData) {
        setCurrentSaveId(saveId);
        onLoad(saveData);
        onClose();
      } else {
        alert('Failed to load save');
      }
    } catch (error) {
      console.error('Error loading:', error);
      alert('Failed to load save');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (saveId) => {
    const save = saves[saveId];
    if (!window.confirm(`Delete save "${save.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const success = await deleteSave(saveId);
      if (success) {
        await loadSaves();
      } else {
        alert('Failed to delete save');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      alert('Failed to delete save');
    }
  };

  const handleRename = (saveId) => {
    setRenamingId(saveId);
    setRenameValue(saves[saveId].name);
  };

  const handleRenameSubmit = async (saveId) => {
    if (!renameValue.trim()) {
      alert('Name cannot be empty');
      return;
    }

    try {
      const success = await renameSave(saveId, renameValue.trim());
      if (success) {
        await loadSaves();
        setRenamingId(null);
        setRenameValue('');
      } else {
        alert('Failed to rename save');
      }
    } catch (error) {
      console.error('Error renaming:', error);
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
            Current Canvas: <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{currentSaveNameDisplay}</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSave()}
              placeholder="Enter save name..."
              className="input"
              style={{ flex: 1 }}
            />
            <button onClick={handleSave} className="btn btn-primary" style={{ minWidth: '120px' }} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Current'}
            </button>
          </div>
          
          {/* Import/Export Section */}
          <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-divider)' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px', fontWeight: 600 }}>
              Import/Export
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => {
                  if (onImport) {
                    onImport();
                  }
                }} 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
              >
                📥 Import Canvas
              </button>
              <button 
                onClick={() => {
                  if (onExportCanvas) {
                    onExportCanvas();
                  }
                }} 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '8px 12px', fontSize: '13px' }}
              >
                📤 Export Canvas
              </button>
            </div>
          </div>
        </div>

        <div className="modal-content" style={{ maxHeight: 'calc(85vh - 250px)', overflowY: 'auto' }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
            Saved Canvases ({savesList.length})
          </h3>

          {isLoading ? (
            <div className="empty-state">Loading saves...</div>
          ) : savesList.length === 0 ? (
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