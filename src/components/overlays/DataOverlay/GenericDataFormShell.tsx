import React from 'react';
import { Trash2, RotateCcw } from 'lucide-react';

interface GenericDataFormShellProps {
  entityId: string | null;
  activeEntity: { id: string; name: string } | null;
  isModified: boolean;
  onRestore: () => void;
  onDelete: () => void;
  onNameChange: (name: string) => void;
  styles: Record<string, string>;
  entityLabel: string;
  EmptyIcon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  children?: React.ReactNode;
  isReadOnly?: boolean;
}

export function GenericDataFormShell({
  entityId,
  activeEntity,
  isModified,
  onRestore,
  onDelete,
  onNameChange,
  styles,
  entityLabel,
  EmptyIcon,
  children,
  isReadOnly = false,
}: GenericDataFormShellProps) {
  const emptyState = (
    <div className={styles['empty-detail']}>
      <EmptyIcon className={styles['empty-icon']} size={40} strokeWidth={1} />
      <div className={styles['empty-title']}>No {entityLabel} Selected</div>
      <div className={styles['empty-desc']}>
        Select a {entityLabel.toLowerCase()} from the master index list on the left to view or edit
        its parameters, or click the plus button to create a new custom {entityLabel.toLowerCase()}.
      </div>
    </div>
  );

  if (!entityId || !activeEntity) {
    return emptyState;
  }

  const labelLower = entityLabel.toLowerCase();

  return (
    <div className={styles['detail-pane']}>
      <div className={styles['editor-form']}>
        <div className={styles['form-header']}>
          <div className={styles['form-title']}>{entityLabel} Specification</div>
        </div>

        <div className={styles['form-body']}>
          <div className={styles['form-group']}>
            <label className={styles['form-label']}>Unique ID</label>
            <input
              type="text"
              className={styles['form-input-readonly']}
              value={activeEntity.id}
              disabled
              title="ID is generated automatically and cannot be changed"
            />
          </div>

          <div className={styles['form-group']}>
            <label className={styles['form-label']}>{entityLabel} Name</label>
            <input
              type="text"
              className={isReadOnly ? styles['form-input-readonly'] : styles['form-input']}
              value={activeEntity.name || ''}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder={`e.g. New ${entityLabel}`}
              maxLength={64}
              disabled={isReadOnly}
            />
          </div>

          {children}

          {!isReadOnly && (
            <div className={styles['form-actions']}>
              {isModified ? (
                <button
                  className={styles[`btn-restore-${labelLower}`] || styles['btn-restore']}
                  onClick={onRestore}
                  title="Restore this entry back to its baseline default configuration"
                >
                  <RotateCcw size={14} />
                  Restore Baseline Defaults
                </button>
              ) : (
                <button
                  className={styles[`btn-delete-${labelLower}`] || styles['btn-delete']}
                  onClick={onDelete}
                  title={`Delete Custom ${entityLabel}`}
                >
                  <Trash2 size={14} />
                  Delete {entityLabel} Record
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
