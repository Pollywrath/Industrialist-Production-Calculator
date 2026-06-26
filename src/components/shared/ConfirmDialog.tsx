import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import styles from './ConfirmDialog.module.css';

export function ConfirmDialog() {
  const confirmDialog = useUIStore((s) => s.confirmDialog);
  const closeConfirm = useUIStore((s) => s.closeConfirm);

  if (!confirmDialog) return null;

  const { options } = confirmDialog;

  return createPortal(
    <div className={styles['confirm-overlay']} onClick={() => closeConfirm('close')}>
      <div className={styles['confirm-modal']} onClick={(e) => e.stopPropagation()}>
        <div className={styles['confirm-header']}>
          <div className={styles['confirm-title']}>
            {options.intent === 'error' && (
              <AlertTriangle size={16} className={styles['error-icon']} />
            )}
            {options.intent === 'info' && (
              <AlertTriangle size={16} className={styles['info-icon']} />
            )}
            {options.intent === 'success' && (
              <AlertTriangle size={16} className={styles['success-icon']} />
            )}
            <span>{options.title}</span>
          </div>
          <button className={styles['confirm-close']} onClick={() => closeConfirm('close')}>
            <X size={18} />
          </button>
        </div>

        <div className={styles['confirm-content']}>
          <p>{options.message}</p>
        </div>

        <div className={styles['confirm-footer']}>
          {options.showCancel !== false && (
            <button className={styles['confirm-btn']} onClick={() => closeConfirm('cancel')}>
              {options.cancelLabel || 'CANCEL'}
            </button>
          )}
          <button
            className={`${styles['confirm-btn']} ${styles[options.intent || 'info']}`}
            onClick={() => closeConfirm('confirm')}
          >
            {options.confirmLabel || 'CONFIRM'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
