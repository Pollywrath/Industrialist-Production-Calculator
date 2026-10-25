import { useEffect, useState } from 'react';
import {
  getCanvasAdapter,
  subscribeCanvasAdapter,
  type CanvasPoint,
} from '../../../canvas/canvasAdapterApi';
import { useUIStore, getEffectiveToggleId } from '../../../stores/useUIStore';
import { isTutorialActive } from '../../../stores/useTutorialStore';
import { getPixiPopupAnchor, getPixiPopupEdgeIds } from '../../../canvas/pixiEdgeInfoPopupGeometry';
import { EdgeInfoPopup } from '../shared/EdgeInfoPopup';

interface ActiveEdgePopup {
  edgeId: string;
  anchor: CanvasPoint;
}

export function PixiEdgeInfoPopupLayer() {
  const [adapterRevision, setAdapterRevision] = useState(0);
  const [activePopup, setActivePopup] = useState<ActiveEdgePopup | null>(null);

  useEffect(() => subscribeCanvasAdapter(() => setAdapterRevision((revision) => revision + 1)), []);

  useEffect(() => {
    const adapter = getCanvasAdapter();
    if (adapter?.canvasType !== 'pixi' || !adapter.subscribeEdgeClick) return;

    return adapter.subscribeEdgeClick((geometryEdgeId, clickPoint) => {
      if (isTutorialActive() || getEffectiveToggleId(useUIStore.getState()) === 'delete_mode') {
        return;
      }
      const edgeIds = getPixiPopupEdgeIds(geometryEdgeId);
      const anchor = getPixiPopupAnchor(clickPoint);
      if (!anchor) return;
      setActivePopup({ edgeId: edgeIds.edgeId, anchor });
    });
  }, [adapterRevision]);

  const isPopupOpen = activePopup !== null;

  useEffect(() => {
    if (!isPopupOpen) return;

    const dismissOnPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-edge-info-popup]')) {
        return;
      }
      setActivePopup(null);
    };
    const dismiss = () => setActivePopup(null);
    document.addEventListener('pointerdown', dismissOnPointerDown, true);
    window.addEventListener('keydown', dismiss, true);
    window.addEventListener('wheel', dismiss, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', dismissOnPointerDown, true);
      window.removeEventListener('keydown', dismiss, true);
      window.removeEventListener('wheel', dismiss, true);
    };
  }, [isPopupOpen]);

  if (!activePopup) return null;
  return (
    <EdgeInfoPopup
      edgeId={activePopup.edgeId}
      anchorX={activePopup.anchor.x}
      anchorY={activePopup.anchor.y}
      onDismiss={() => setActivePopup(null)}
    />
  );
}
