import { createPortal } from 'react-dom';
import styles from './LoadingScreen.module.css';
import { INDUS_LOGO_SRC } from '../../data/productIcons';

interface LoadingScreenProps {
  title: string;
  subtitle: string;
}

export function LoadingScreen({ title, subtitle }: LoadingScreenProps) {
  return createPortal(
    <div className={styles['loading-screen-container']}>
      <div className={styles['loading-screen-modal']}>
        <img src={INDUS_LOGO_SRC} className={styles['loading-spinner']} alt="L" />
        <div>
          <div className={styles['loading-screen-title']}>{title}</div>
          <div className={styles['loading-screen-subtitle']}>{subtitle}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
