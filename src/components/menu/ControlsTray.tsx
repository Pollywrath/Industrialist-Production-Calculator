import {
  Plus,
  Trash2,
  MousePointerSquareDashed,
  Target,
  Network,
  Cpu,
  Sparkles,
  Settings,
  Clock,
  Eraser,
  Undo,
  Redo,
} from 'lucide-react';
import useControlStore from '../../stores/useControlStore';
import useFlowStore from '../../stores/useFlowStore';
import styles from './ControlsTray.module.css';

interface ButtonConfig {
  id: string;
  label: string;
  type: 'menu' | 'toggle' | 'switch' | 'action';
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  dividerRight?: boolean;
  dividerBottom?: boolean;
}

const BUTTONS: ButtonConfig[] = [
  {
    id: 'add_recipe',
    label: 'Add Recipe',
    type: 'menu',
    Icon: Plus,
    dividerBottom: true,
  },
  {
    id: 'delete_mode',
    label: 'Delete',
    type: 'toggle',
    Icon: Trash2,
    dividerBottom: true,
  },
  {
    id: 'multi_select',
    label: 'Multi-select',
    type: 'toggle',
    Icon: MousePointerSquareDashed,
    dividerBottom: true,
  },
  {
    id: 'target',
    label: 'Target',
    type: 'toggle',
    Icon: Target,
    dividerRight: true,
    dividerBottom: true,
  },
  {
    id: 'layout',
    label: 'Layout',
    type: 'menu',
    Icon: Network,
    dividerBottom: true,
  },
  {
    id: 'compute',
    label: 'Compute',
    type: 'menu',
    Icon: Cpu,
    dividerBottom: true,
  },

  { id: 'coming_soon', label: 'Coming Soon', type: 'switch', Icon: Sparkles },
  {
    id: 'machine_toggle',
    label: 'Machine',
    type: 'menu',
    Icon: Settings,
    dividerRight: true,
  },
  {
    id: 'rate_mode',
    label: 'Rate',
    type: 'switch',
    Icon: Clock,
    dividerRight: true,
  },
  { id: 'clear_canvas', label: 'Clear', type: 'action', Icon: Eraser },
  { id: 'undo', label: 'Undo', type: 'action', Icon: Undo },
  { id: 'redo', label: 'Redo', type: 'action', Icon: Redo },
];

export default function ControlsTray() {
  const isMinimized = useControlStore((s) => s.isMinimized);
  const activeToggles = useControlStore((s) => s.activeToggles);
  const rateMode = useControlStore((s) => s.rateMode);

  const handleButtonClick = (btn: ButtonConfig) => {
    const controlStore = useControlStore.getState();
    if (btn.id === 'add_recipe') {
      controlStore.setRecipeSelectorOpen(true);
    } else if (btn.id === 'delete_mode') {
      controlStore.toggleButton('delete_mode');
    } else if (btn.id === 'multi_select') {
      controlStore.toggleButton('multi_select');
    } else if (btn.id === 'target') {
      controlStore.toggleButton('target');
    } else if (btn.id === 'coming_soon') {
      controlStore.toggleButton('coming_soon');
    } else if (btn.id === 'rate_mode') {
      controlStore.cycleRateMode();
    } else if (btn.id === 'clear_canvas') {
      const flowStore = useFlowStore.getState();
      flowStore.setNodes([]);
      flowStore.setEdges([]);
    } else if (btn.type === 'toggle') {
      controlStore.toggleButton(btn.id);
    }
  };

  const getRateButtonLabel = () => {
    switch (rateMode) {
      case 'second':
        return '/sec';
      case 'minute':
        return '/min';
      case 'hour':
        return '/hr';
      case 'raw':
        return 'Raw';
    }
  };

  return (
    <div className={styles['controls-tray-container']}>
      <div className={styles['controls-tray-bar']} onClick={() => useControlStore.getState().toggleMinimized()}>
        <span className={styles['controls-tray-bar-text']}>
          {isMinimized ? '▲ SHOW CONTROLS' : '▼ HIDE CONTROLS'}
        </span>
      </div>

      {!isMinimized && (
        <div className={styles['controls-tray-grid']}>
          {BUTTONS.map((btn) => {
            const isToggled = !!activeToggles[btn.id];
            const label = btn.id === 'rate_mode' ? getRateButtonLabel() : btn.label;
            const Icon = btn.Icon;

            return (
              <button
                key={btn.id}
                className={`${styles['controls-tray-button']} type-${btn.type} ${isToggled ? styles['is-active'] : ''} ${btn.dividerRight ? styles['has-divider-right'] : ''} ${btn.dividerBottom ? styles['has-divider-bottom'] : ''}`}
                onClick={() => handleButtonClick(btn)}
                title={`${btn.label} (${btn.type})`}
              >
                <Icon size={16} className={styles['controls-tray-button-icon']} />
                <span className={styles['controls-tray-button-label']}>{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
