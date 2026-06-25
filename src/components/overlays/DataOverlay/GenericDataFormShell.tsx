import type { ComponentType, ReactNode } from 'react';
import { Trash2, RotateCcw } from 'lucide-react';
import { getDataOverrides } from '../../../persistence/idb';
import {
  canPerformTutorialAction,
  completeTutorialAction,
  isTutorialActive,
  useTutorialStore,
} from '../../../stores/useTutorialStore';
import styles from './DataCrud.module.css';

interface GenericDataFormShellProps {
  entityId: string | null;
  activeEntity: { id: string; name: string } | null;
  isModified: boolean;
  onRestore?: () => void | Promise<void>;
  onDelete?: () => void;
  onNameChange?: (name: string) => void;
  entityLabel: string;
  EmptyIcon: ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  children?: ReactNode;
  isReadOnly?: boolean;
}

export function GenericDataFormShell({
  entityId,
  activeEntity,
  isModified,
  onRestore,
  onDelete,
  onNameChange,
  entityLabel,
  EmptyIcon,
  children,
  isReadOnly = false,
}: GenericDataFormShellProps) {
  const entityKey =
    entityLabel === 'Product'
      ? 'product'
      : entityLabel === 'Machine'
        ? 'machine'
        : entityLabel === 'Recipe' || entityLabel === 'Special Recipe'
          ? 'recipe'
          : 'research';

  const handleNameChange = (name: string) => {
    const field = `${entityKey}.name`;
    if (isTutorialActive()) {
      const action = useTutorialStore.getState().getCurrentStep()?.action;
      if (action?.type !== 'data-field' || action.field !== field) return;
    }
    onNameChange?.(name);
    completeTutorialAction({ type: 'data-field', field, value: name });
  };

  const handleRestore = async () => {
    if (!entityId) return;
    if (
      isTutorialActive() &&
      !canPerformTutorialAction({ type: 'data-restore', entity: entityKey, id: entityId })
    ) {
      return;
    }
    await onRestore?.();
    if (isTutorialActive()) {
      const dataOverrides = await getDataOverrides();
      completeTutorialAction({
        type: 'data-restore',
        entity: entityKey,
        id: entityId,
        dataOverrides,
      });
    }
  };

  const handleDelete = () => {
    if (isTutorialActive()) return;
    onDelete?.();
  };

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
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={`e.g. New ${entityLabel}`}
              maxLength={64}
              disabled={isReadOnly}
              data-tutorial-data-field={`${entityKey}.name`}
            />
          </div>

          {children}

          {!isReadOnly && (
            <div className={styles['form-actions']}>
              {isModified ? (
                <button
                  className={styles['btn-restore']}
                  onClick={() => void handleRestore()}
                  title="Restore this entry back to its baseline default configuration"
                  data-tutorial-data-restore={`${entityKey}:${entityId}`}
                >
                  <RotateCcw size={14} />
                  Restore Baseline Defaults
                </button>
              ) : (
                <button
                  className={styles['btn-delete']}
                  onClick={handleDelete}
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
