import type React from 'react';
import { Save, Database, Palette, HelpCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import styles from './OverlaysTray.module.css';

interface OverlayButtonConfig {
  id: 'saves' | 'data' | 'theme' | 'help';
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  dividerBottom?: boolean;
}

const BUTTONS: OverlayButtonConfig[] = [
  { id: 'saves', label: 'Saves', Icon: Save, dividerBottom: true },
  { id: 'data', label: 'Data', Icon: Database, dividerBottom: true },
  { id: 'theme', label: 'Theme', Icon: Palette, dividerBottom: true },
  { id: 'help', label: 'Help', Icon: HelpCircle },
];

export function OverlaysTray() {
  const isSavesOverlayOpen = useUIStore((s) => s.isSavesOverlayOpen);
  const setSavesOverlayOpen = useUIStore((s) => s.setSavesOverlayOpen);
  const isDataOverlayOpen = useUIStore((s) => s.isDataOverlayOpen);
  const setDataOverlayOpen = useUIStore((s) => s.setDataOverlayOpen);
  const isOverlaysMinimized = useUIStore((s) => s.isOverlaysMinimized);
  const toggleOverlaysMinimized = useUIStore((s) => s.toggleOverlaysMinimized);

  const handleClick = (id: 'saves' | 'data' | 'theme' | 'help') => {
    if (id === 'saves') {
      setSavesOverlayOpen(!isSavesOverlayOpen);
    } else if (id === 'data') {
      setDataOverlayOpen(!isDataOverlayOpen);
    }
  };

  return (
    <div className={styles['overlays-tray-container']}>
      {!isOverlaysMinimized && (
        <div className={styles['overlays-tray-grid']}>
          {BUTTONS.map((btn) => {
            const isDisabled = btn.id !== 'saves' && btn.id !== 'data';
            const isActive =
              (btn.id === 'saves' && isSavesOverlayOpen) ||
              (btn.id === 'data' && isDataOverlayOpen);
            const Icon = btn.Icon;

            return (
              <button
                key={btn.id}
                className={`${styles['overlays-tray-button']} ${isActive ? styles['is-active'] : ''} ${btn.dividerBottom ? styles['has-divider-bottom'] : ''}`}
                onClick={() => handleClick(btn.id)}
                disabled={isDisabled}
              >
                <Icon size={16} className={styles['overlays-tray-button-icon']} />
                <span className={styles['overlays-tray-button-label']}>{btn.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <button className={styles['overlays-tray-bar']} onClick={toggleOverlaysMinimized}>
        <span className={styles['overlays-tray-bar-text']}>
          {isOverlaysMinimized ? (
            <>
              <ChevronDown size={10} />
              <span>MENU</span>
            </>
          ) : (
            <>
              <ChevronUp size={10} />
              <span>HIDE</span>
            </>
          )}
        </span>
      </button>
    </div>
  );
}
