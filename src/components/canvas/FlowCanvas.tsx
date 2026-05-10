import useControlStore, { getEffectiveToggleId } from '../../stores/useControlStore';
import ControlsTray from '../menu/ControlsTray';
import RecipeSelector from '../overlays/RecipeSelector';
import FlowViewport from './FlowViewport';

export default function FlowCanvas() {
  const isDeleteMode = useControlStore((s) => getEffectiveToggleId(s) === 'delete_mode');

  return (
    <div
      style={{ width: '100vw', height: '100dvh', background: 'var(--theme-color-canvas-bg)' }}
      className={isDeleteMode ? 'is-delete-mode' : ''}
    >
      <FlowViewport />
      <ControlsTray />
      <RecipeSelector />
    </div>
  );
}
