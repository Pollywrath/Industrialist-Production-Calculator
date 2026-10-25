import { Application, Container, FederatedPointerEvent } from 'pixi.js';
import { MAX_ZOOM, MIN_ZOOM, ViewportStore } from '../../state/viewport-store';
import { clientPointToCanvas } from './client-coordinates';
import { resolveCanvasInteractionConfig, type CanvasInteractionConfig } from './config';

interface PanGesture {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly viewportX: number;
  readonly viewportY: number;
}

export function getViewportAfterZoom(
  viewport: { readonly x: number; readonly y: number; readonly zoom: number },
  pointerX: number,
  pointerY: number,
  screenWidth: number,
  screenHeight: number,
  requestedZoom: number,
) {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, requestedZoom));
  const worldX = (pointerX - screenWidth / 2 - viewport.x) / viewport.zoom;
  const worldY = (pointerY - screenHeight / 2 - viewport.y) / viewport.zoom;
  return {
    x: pointerX - screenWidth / 2 - worldX * zoom,
    y: pointerY - screenHeight / 2 - worldY * zoom,
    zoom,
  };
}

export function getViewportCenteredOnBounds(
  viewport: { readonly x: number; readonly y: number; readonly zoom: number },
  bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  },
) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    x: -centerX * viewport.zoom,
    y: -centerY * viewport.zoom,
    zoom: viewport.zoom,
  };
}

export function getViewportAfterPinch(
  viewport: { readonly x: number; readonly y: number; readonly zoom: number },
  previousDistance: number,
  distance: number,
  previousMidpoint: { readonly x: number; readonly y: number },
  midpoint: { readonly x: number; readonly y: number },
  screenWidth: number,
  screenHeight: number,
) {
  if (!(previousDistance > 0) || !(distance > 0)) return viewport;
  const zoomed = getViewportAfterZoom(
    viewport,
    previousMidpoint.x,
    previousMidpoint.y,
    screenWidth,
    screenHeight,
    (viewport.zoom * distance) / previousDistance,
  );
  return {
    ...zoomed,
    x: zoomed.x + midpoint.x - previousMidpoint.x,
    y: zoomed.y + midpoint.y - previousMidpoint.y,
  };
}

export function createViewportInput(
  app: Application,
  host: HTMLElement,
  camera: ViewportStore,
  world: Container,
  onBackgroundPointerDown?: (event: FederatedPointerEvent) => boolean,
  onPanStateChange?: (panning: boolean) => void,
  isLocked: () => boolean = () => false,
  onGestureCancel?: () => void,
  interactionConfig: CanvasInteractionConfig = {},
) {
  const config = resolveCanvasInteractionConfig(interactionConfig);
  let panGesture: PanGesture | null = null;
  let spaceDown = false;
  let pinchGesture: {
    readonly distance: number;
    readonly midpoint: { readonly x: number; readonly y: number };
  } | null = null;
  const originalTouchAction = host.style.touchAction;
  const keyboardTarget = typeof window === 'undefined' ? null : window;

  function startPan(event: FederatedPointerEvent) {
    const forcedPan = event.button === 1 || event.button === 2 || (config.spaceToPan && spaceDown);
    if (event.target !== world && !forcedPan) return;
    if (!forcedPan && event.button !== 0) return;
    if (isLocked()) return;
    if (!forcedPan && onBackgroundPointerDown?.(event)) {
      event.stopPropagation();
      return;
    }
    if (!config.pan) return;
    const viewport = camera.getState();
    panGesture = {
      pointerX: event.global.x,
      pointerY: event.global.y,
      viewportX: viewport.x,
      viewportY: viewport.y,
    };
    onPanStateChange?.(true);
    host.style.cursor = 'grabbing';
    event.stopPropagation();
  }

  function movePan(event: FederatedPointerEvent) {
    if (!panGesture) return;
    const viewport = camera.getState();
    camera.setViewport({
      ...viewport,
      x: panGesture.viewportX + event.global.x - panGesture.pointerX,
      y: panGesture.viewportY + event.global.y - panGesture.pointerY,
    });
  }

  function endPan() {
    if (!panGesture) return;
    panGesture = null;
    onPanStateChange?.(false);
    host.style.cursor = '';
  }

  function zoomAtPointer(event: WheelEvent) {
    event.preventDefault();
    if (!config.zoom || isLocked()) return;
    const bounds = app.canvas.getBoundingClientRect();
    const pointer = clientPointToCanvas(
      event.clientX,
      event.clientY,
      bounds,
      app.screen.width,
      app.screen.height,
    );
    if (!pointer) return;
    const viewport = camera.getState();
    camera.setViewport(
      getViewportAfterZoom(
        viewport,
        pointer.x,
        pointer.y,
        app.screen.width,
        app.screen.height,
        viewport.zoom * Math.exp(-event.deltaY * 0.001),
      ),
    );
  }

  function screenTouch(touch: Touch) {
    const bounds = app.canvas.getBoundingClientRect();
    return clientPointToCanvas(
      touch.clientX,
      touch.clientY,
      bounds,
      app.screen.width,
      app.screen.height,
    );
  }

  function touchDistance(
    first: { readonly x: number; readonly y: number },
    second: { readonly x: number; readonly y: number },
  ) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function touchMidpoint(
    first: { readonly x: number; readonly y: number },
    second: { readonly x: number; readonly y: number },
  ) {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  }

  function startPinch(event: TouchEvent) {
    if (!config.zoom || event.touches.length < 2 || isLocked()) return;
    const first = screenTouch(event.touches[0]);
    const second = screenTouch(event.touches[1]);
    if (!first || !second) return;
    event.preventDefault();
    endPan();
    onGestureCancel?.();
    pinchGesture = {
      distance: touchDistance(first, second),
      midpoint: touchMidpoint(first, second),
    };
  }

  function movePinch(event: TouchEvent) {
    if (!config.zoom || !pinchGesture || event.touches.length < 2 || isLocked()) return;
    const first = screenTouch(event.touches[0]);
    const second = screenTouch(event.touches[1]);
    if (!first || !second) return;
    event.preventDefault();
    const distance = touchDistance(first, second);
    const midpoint = touchMidpoint(first, second);
    const viewport = camera.getState();
    camera.setViewport(
      getViewportAfterPinch(
        viewport,
        pinchGesture.distance,
        distance,
        pinchGesture.midpoint,
        midpoint,
        app.screen.width,
        app.screen.height,
      ),
    );
    pinchGesture = { distance, midpoint };
  }

  function finishPinch(event: TouchEvent) {
    if (event.touches.length < 2) pinchGesture = null;
  }

  function keyDown(event: KeyboardEvent) {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName));
    if (!config.spaceToPan || event.code !== 'Space' || typing) return;
    spaceDown = true;
    event.preventDefault();
  }

  function keyUp(event: KeyboardEvent) {
    if (event.code === 'Space') spaceDown = false;
  }

  function contextMenu(event: MouseEvent) {
    event.preventDefault();
  }

  host.style.touchAction = 'none';

  world.on('pointerdown', startPan);
  app.stage.on('globalpointermove', movePan);
  app.stage.on('pointerup', endPan);
  app.stage.on('pointerupoutside', endPan);
  app.canvas.addEventListener('wheel', zoomAtPointer, { passive: false });
  app.canvas.addEventListener('touchstart', startPinch, { passive: false });
  app.canvas.addEventListener('touchmove', movePinch, { passive: false });
  app.canvas.addEventListener('touchend', finishPinch);
  app.canvas.addEventListener('touchcancel', finishPinch);
  app.canvas.addEventListener('contextmenu', contextMenu);
  keyboardTarget?.addEventListener('keydown', keyDown);
  keyboardTarget?.addEventListener('keyup', keyUp);

  return {
    cancel: endPan,
    setLocked(locked: boolean) {
      if (locked) {
        endPan();
        pinchGesture = null;
      }
    },
    destroy() {
      endPan();
      world.off('pointerdown', startPan);
      app.stage.off('globalpointermove', movePan);
      app.stage.off('pointerup', endPan);
      app.stage.off('pointerupoutside', endPan);
      app.canvas.removeEventListener('wheel', zoomAtPointer);
      app.canvas.removeEventListener('touchstart', startPinch);
      app.canvas.removeEventListener('touchmove', movePinch);
      app.canvas.removeEventListener('touchend', finishPinch);
      app.canvas.removeEventListener('touchcancel', finishPinch);
      app.canvas.removeEventListener('contextmenu', contextMenu);
      keyboardTarget?.removeEventListener('keydown', keyDown);
      keyboardTarget?.removeEventListener('keyup', keyUp);
      host.style.touchAction = originalTouchAction;
      host.style.cursor = '';
    },
  };
}
