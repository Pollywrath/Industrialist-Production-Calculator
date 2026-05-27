import { createPortal } from 'react-dom';
import styles from './LoadingScreen.module.css';
import { LOGO_SRC } from '../../bootstrap/logoPreload';

interface LoadingScreenProps {
  title: string;
  subtitle: string;
}

export function LoadingScreen({ title, subtitle }: LoadingScreenProps) {
  return createPortal(
    <div className={styles['loading-screen-container']}>
      <div className={styles['loading-screen-modal']}>
        <img src={LOGO_SRC} className={styles['loading-spinner']} alt="L" />
        <div>
          <div className={styles['loading-screen-title']}>{title}</div>
          <div className={styles['loading-screen-subtitle']}>{subtitle}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
