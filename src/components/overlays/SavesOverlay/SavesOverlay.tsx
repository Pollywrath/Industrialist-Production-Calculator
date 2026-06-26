import { useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Save as SaveIcon,
  X,
  Upload,
  Download,
  Image as ImageIcon,
  Edit2,
  Check,
  Trash2,
  FolderOpen,
  Plus,
  GitMerge,
  RefreshCw,
  Replace,
} from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import {
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';
import type { SaveRecord } from '../../../types/saves';
import { VirtualList } from '../../shared/VirtualList';
import { SavesOverlayProvider } from './SavesOverlayProvider';
import { useSavesOverlayStore } from './SavesOverlayContext';
import styles from './SavesOverlay.module.css';

export function SavesOverlay() {
  const isSavesOverlayOpen = useUIStore((s) => s.isSavesOverlayOpen);

  if (!isSavesOverlayOpen) return null;

  return (
    <SavesOverlayProvider>
      <SavesOverlayModal />
    </SavesOverlayProvider>
  );
}

function SavesOverlayModal() {
  const setSavesOverlayOpen = useUIStore((s) => s.setSavesOverlayOpen);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saves = useSavesOverlayStore((s) => s.saves);
  const newSaveName = useSavesOverlayStore((s) => s.newSaveName);
  const editingId = useSavesOverlayStore((s) => s.editingId);
  const editName = useSavesOverlayStore((s) => s.editName);
  const status = useSavesOverlayStore((s) => s.status);
  const pendingId = useSavesOverlayStore((s) => s.pendingId);
  const pendingAction = useSavesOverlayStore((s) => s.pendingAction);

  const setNewSaveName = useSavesOverlayStore((s) => s.setNewSaveName);
  const setEditName = useSavesOverlayStore((s) => s.setEditName);
  const handleCreateSave = useSavesOverlayStore((s) => s.handleCreateSave);
  const handleOverwriteLoad = useSavesOverlayStore((s) => s.handleOverwriteLoad);
  const handleMergeLoad = useSavesOverlayStore((s) => s.handleMergeLoad);
  const handleOverwriteSave = useSavesOverlayStore((s) => s.handleOverwriteSave);
  const handleDeleteSave = useSavesOverlayStore((s) => s.handleDeleteSave);
  const startRename = useSavesOverlayStore((s) => s.startRename);
  const commitRename = useSavesOverlayStore((s) => s.commitRename);
  const cancelRename = useSavesOverlayStore((s) => s.cancelRename);
  const handleImportJson = useSavesOverlayStore((s) => s.handleImportJson);
  const handleExportJson = useSavesOverlayStore((s) => s.handleExportJson);
  const handleExportPng = useSavesOverlayStore((s) => s.handleExportPng);

  const handleClose = () => {
    if (isTutorialActive()) return;
    setSavesOverlayOpen(false);
  };

  const handleSaveNameChange = (value: string) => {
    if (isTutorialActive()) {
      const action = useTutorialStore.getState().getCurrentStep()?.action;
      if (action?.type !== 'save-name') return;
    }
    setNewSaveName(value);
    completeTutorialAction({ type: 'save-name', value });
  };

  return createPortal(
    <div className={styles['saves-overlay']} onClick={handleClose}>
      <div className={styles['saves-modal']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['saves-header']}>
          <div className={styles['saves-title']} id="saves-dialog-title">
            <SaveIcon size={18} />
            <span>Save Manager</span>
          </div>
          <div className={styles['saves-header-actions']}>
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              onChange={handleImportJson}
              className={styles['hidden-input']}
            />
            <button
              className={styles['saves-import-icon']}
              onClick={() => {
                if (isTutorialActive()) return;
                fileInputRef.current?.click();
              }}
              disabled={status.type === 'pending'}
            >
              {status.type === 'pending' && pendingAction === 'import' ? (
                <RefreshCw size={18} className={styles['spin']} />
              ) : (
                <Upload size={18} />
              )}
            </button>
            <button className={styles['saves-close']} onClick={handleClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles['saves-toolbar']}>
          <input
            type="text"
            placeholder="Save name..."
            value={newSaveName}
            onChange={(e) => handleSaveNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateSave('keyboard');
            }}
            className={styles['saves-input']}
            data-tutorial-save="name"
          />
          <button
            className={`${styles['saves-btn']} ${styles['primary']}`}
            onClick={() => void handleCreateSave('button')}
            disabled={!newSaveName.trim() || status.type === 'pending'}
            data-tutorial-save="create"
          >
            {status.type === 'pending' && pendingAction === 'create' ? (
              <>
                <RefreshCw size={14} className={styles['spin']} />
                <span>SAVING...</span>
              </>
            ) : status.type === 'success' && status.message.includes('Save') ? (
              <>
                <Check size={14} />
                <span>SAVED!</span>
              </>
            ) : (
              <>
                <Plus size={14} />
                <span>SAVE</span>
              </>
            )}
          </button>
          <button
            className={styles['saves-btn']}
            onClick={() => {
              if (isTutorialActive()) return;
              void handleExportPng();
            }}
            disabled={status.type === 'pending'}
          >
            {status.type === 'pending' && pendingAction === 'export_png' ? (
              <>
                <RefreshCw size={14} className={styles['spin']} />
                <span>EXPORTING...</span>
              </>
            ) : (
              <>
                <ImageIcon size={14} />
                <span>EXPORT PNG</span>
              </>
            )}
          </button>
        </div>

        <div className={styles['saves-content']}>
          {saves.length === 0 ? (
            <div className={styles['save-empty']}>
              No saves found. Create one above or import a JSON save file.
            </div>
          ) : (
            <VirtualList<SaveRecord>
              items={saves}
              itemHeight={100}
              height={440}
              className={styles['saves-list']}
              getKey={(record) => record.id}
            >
              {(record) => (
                <div className={styles['save-card-wrapper']}>
                  <div className={styles['save-card']}>
                    <div className={styles['save-card-info']}>
                      {editingId === record.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(record.id);
                            if (e.key === 'Escape') cancelRename();
                          }}
                          onBlur={() => cancelRename()}
                          autoFocus
                          className={styles['rename-input']}
                        />
                      ) : (
                        <div className={styles['save-card-title-row']}>
                          <span className={styles['save-card-title']}>{record.name}</span>
                          {record.data.dataOverrides && record.data.dataOverrides.length > 0 && (
                            <span className={styles['badge-custom-data']}>CUSTOM DB</span>
                          )}
                        </div>
                      )}
                      <div className={styles['save-card-meta']}>
                        <span>{new Date(record.timestamp).toLocaleString()}</span>
                        <span>Nodes: {record.data.nodes?.length ?? 0}</span>
                      </div>
                    </div>

                    <div className={styles['save-card-actions']}>
                      <button
                        className={styles['action-btn']}
                        onClick={() => handleOverwriteLoad(record)}
                        disabled={pendingId === record.id}
                        aria-label={`Load ${record.name}`}
                        title="Load save"
                      >
                        {pendingId === record.id && pendingAction === 'load' ? (
                          <RefreshCw size={14} className={styles['spin']} />
                        ) : (
                          <FolderOpen size={14} />
                        )}
                      </button>
                      <button
                        className={styles['action-btn']}
                        onClick={() => handleMergeLoad(record)}
                        disabled={pendingId === record.id}
                        aria-label={`Merge ${record.name}`}
                        title="Merge save"
                      >
                        {pendingId === record.id && pendingAction === 'merge' ? (
                          <RefreshCw size={14} className={styles['spin']} />
                        ) : (
                          <GitMerge size={14} />
                        )}
                      </button>
                      <button
                        className={styles['action-btn']}
                        onClick={() => handleOverwriteSave(record)}
                        disabled={pendingId === record.id}
                        aria-label={`Overwrite ${record.name}`}
                        title="Overwrite save with current canvas"
                      >
                        {pendingId === record.id && pendingAction === 'save' ? (
                          <RefreshCw size={14} className={styles['spin']} />
                        ) : (
                          <Replace size={14} />
                        )}
                      </button>
                      {editingId === record.id ? (
                        <button
                          className={styles['action-btn']}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            commitRename(record.id);
                          }}
                          disabled={pendingId === record.id}
                          aria-label={`Confirm rename for ${record.name}`}
                          title="Confirm rename"
                        >
                          {pendingId === record.id && pendingAction === 'rename' ? (
                            <RefreshCw size={14} className={styles['spin']} />
                          ) : (
                            <Check size={14} />
                          )}
                        </button>
                      ) : (
                        <button
                          className={styles['action-btn']}
                          onClick={() => startRename(record)}
                          disabled={pendingId === record.id}
                          aria-label={`Rename ${record.name}`}
                          title="Rename save"
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                      <button
                        className={styles['action-btn']}
                        onClick={() => handleExportJson(record)}
                        disabled={pendingId === record.id}
                        aria-label={`Export ${record.name}`}
                        title="Export save JSON"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        className={styles['action-btn']}
                        onClick={() => handleDeleteSave(record.id)}
                        disabled={pendingId === record.id}
                        aria-label={`Delete ${record.name}`}
                        title="Delete save"
                      >
                        {pendingId === record.id && pendingAction === 'delete' ? (
                          <RefreshCw size={14} className={styles['spin']} />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </VirtualList>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
